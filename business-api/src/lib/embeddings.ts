import { createHash } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { config } from "../config.js";
import { getDatabase, getOrm, getVectorBackend } from "../db/connection.js";
import { entityEmbeddings } from "../db/schema/index.js";
import { AppError } from "./errors.js";
import { createTextEmbedding } from "./embedding-provider.js";
import { createPrefixedId } from "./ids.js";
import { getConfiguredEmbeddingDimensions } from "./llm-config.js";

export type EmbeddingEntityType =
  | "company_card"
  | "contact"
  | "document"
  | "deal"
  | "sales_invoice"
  | "task";

export function hashEmbeddingContent(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function createStubEmbedding(text: string, dimensions = 1536): number[] {
  const hash = hashEmbeddingContent(text);
  const values = Array.from({ length: dimensions }, (_, index) => {
    const pair = hash.slice((index * 2) % hash.length, ((index * 2) % hash.length) + 2);
    return Number.parseInt(pair.padEnd(2, "0"), 16) / 255;
  });

  return values;
}

export function getExpectedEmbeddingDimensions(): number {
  return getConfiguredEmbeddingDimensions();
}

export function computeEmbeddingText(entityType: EmbeddingEntityType, entity: Record<string, unknown>): string {
  switch (entityType) {
    case "company_card":
      return [
        entity.displayName,
        entity.legalName,
        entity.taxId,
        entity.email,
        entity.phone,
        entity.website,
      ]
        .filter(Boolean)
        .join(" ");
    case "contact":
      return [
        entity.displayName,
        entity.legalName,
        Array.isArray(entity.roles) ? entity.roles.join(" ") : entity.roles,
        entity.taxId,
        entity.email,
        entity.notes,
      ]
        .filter(Boolean)
        .join(" ");
    case "document":
      return [
        entity.kind,
        entity.source,
        entity.originalFilename,
        entity.filename,
        entity.mimeType,
        entity.ocrStatus,
        entity.ocrText,
        typeof entity.extractedData === "object" && entity.extractedData ? JSON.stringify(entity.extractedData) : "",
      ]
        .filter(Boolean)
        .join(" ");
    case "deal":
      return [
        entity.title,
        entity.stage,
        entity.notes,
        Array.isArray(entity.lineItems)
          ? entity.lineItems
              .map((lineItem) =>
                typeof lineItem === "object" && lineItem
                  ? Object.values(lineItem as Record<string, unknown>).join(" ")
                  : "",
              )
              .join(" ")
          : "",
      ]
        .filter(Boolean)
        .join(" ");
    case "sales_invoice":
      return [
        entity.invoiceNumber,
        entity.status,
        entity.customerDisplayName,
        entity.customerLegalName,
        entity.customerEmail,
        entity.currency,
        entity.issueDate,
        entity.serviceDate,
        entity.dueDate,
        entity.notes,
        Array.isArray(entity.lineItems)
          ? entity.lineItems
              .map((lineItem) =>
                typeof lineItem === "object" && lineItem
                  ? Object.values(lineItem as Record<string, unknown>).join(" ")
                  : "",
              )
              .join(" ")
          : "",
      ]
        .filter(Boolean)
        .join(" ");
    case "task":
      return [entity.title, entity.description, entity.status, entity.priority].filter(Boolean).join(" ");
  }
}

export async function createEmbeddingVector(text: string): Promise<{ model: string; vector: number[]; dimensions: number }> {
  try {
    return await createTextEmbedding(text);
  } catch (error) {
    if (!config.EMBEDDING_ALLOW_STUB_FALLBACK) {
      throw error;
    }

    return {
      model: "stub-embedding-v1",
      vector: createStubEmbedding(text, getExpectedEmbeddingDimensions()),
      dimensions: getExpectedEmbeddingDimensions(),
    };
  }
}

export function isBenignEmbeddingSyncError(error: unknown): boolean {
  return error instanceof TypeError && error.message.includes("database connection is not open");
}

function assertEmbeddingDimensions(vector: number[]): void {
  const expectedDimensions = getExpectedEmbeddingDimensions();
  if (vector.length !== expectedDimensions) {
    throw new AppError(
      `Embedding dimension mismatch: expected ${expectedDimensions}, received ${vector.length}`,
      {
        statusCode: 500,
        code: "embedding_dimension_mismatch",
      },
    );
  }
}

export async function upsertEmbedding(entityType: EmbeddingEntityType, entityId: string, text: string): Promise<void> {
  const contentHash = hashEmbeddingContent(text);
  const db = getOrm();
  const sqlite = getDatabase();
  const now = new Date().toISOString();
  const getExisting = () =>
    db
      .select()
      .from(entityEmbeddings)
      .where(and(eq(entityEmbeddings.entityType, entityType), eq(entityEmbeddings.entityId, entityId)))
      .get();
  let existing = getExisting();

  if (existing && existing.contentHash === contentHash) {
    return;
  }

  const embedding = await createEmbeddingVector(text);
  assertEmbeddingDimensions(embedding.vector);
  const embeddingJson = JSON.stringify(embedding.vector);

  if (existing) {
    db.update(entityEmbeddings)
      .set({
        contentHash,
        model: embedding.model,
        createdAt: now,
      })
      .where(eq(entityEmbeddings.id, existing.id))
      .run();

    const existingRow = sqlite
      .prepare("SELECT rowid FROM entity_embeddings WHERE id = ?")
      .get(existing.id) as { rowid: number } | undefined;

    if (existingRow) {
      sqlite.prepare("DELETE FROM vec_embeddings WHERE rowid = ?").run(existingRow.rowid);
      sqlite
        .prepare("INSERT INTO vec_embeddings(rowid, embedding) VALUES (?, ?)")
        .run(existingRow.rowid, embeddingJson);
    }

    return;
  }

  const embeddingId = createPrefixedId("emb_");
  try {
    db.insert(entityEmbeddings)
      .values({
        id: embeddingId,
        entityType,
        entityId,
        contentHash,
        model: embedding.model,
        createdAt: now,
      })
      .run();

    const insertedRow = sqlite
      .prepare("SELECT rowid FROM entity_embeddings WHERE id = ?")
      .get(embeddingId) as { rowid: number } | undefined;

    if (insertedRow) {
      sqlite
        .prepare("INSERT INTO vec_embeddings(rowid, embedding) VALUES (?, ?)")
        .run(insertedRow.rowid, embeddingJson);
    }
  } catch (error) {
    if (!(error instanceof Error) || !String((error as { code?: string }).code).includes("SQLITE_CONSTRAINT")) {
      throw error;
    }

    existing = getExisting();
    if (!existing) {
      throw error;
    }

    db.update(entityEmbeddings)
      .set({
        contentHash,
        model: embedding.model,
        createdAt: now,
      })
      .where(eq(entityEmbeddings.id, existing.id))
      .run();

    const existingRow = sqlite
      .prepare("SELECT rowid FROM entity_embeddings WHERE id = ?")
      .get(existing.id) as { rowid: number } | undefined;

    if (existingRow) {
      sqlite.prepare("DELETE FROM vec_embeddings WHERE rowid = ?").run(existingRow.rowid);
      sqlite
        .prepare("INSERT INTO vec_embeddings(rowid, embedding) VALUES (?, ?)")
        .run(existingRow.rowid, embeddingJson);
    }
  }
}

export async function findSimilar(
  entityType: EmbeddingEntityType,
  query: string,
  limit = 5,
): Promise<Array<{ entityId: string; distance: number }>> {
  const queryEmbedding = (await createEmbeddingVector(query)).vector;
  if (getVectorBackend() !== "sqlite-vec") {
    const rows = getDatabase()
      .prepare(
        `
          SELECT entity_embeddings.entity_id AS entityId, vec_embeddings.embedding AS embedding
          FROM vec_embeddings
          JOIN entity_embeddings ON entity_embeddings.rowid = vec_embeddings.rowid
          WHERE entity_embeddings.entity_type = ?
        `,
      )
      .all(entityType) as Array<{ entityId: string; embedding: string }>;

    return rows
      .map((row) => ({
        entityId: row.entityId,
        distance: cosineDistance(queryEmbedding, JSON.parse(row.embedding) as number[]),
      }))
      .sort((left, right) => left.distance - right.distance)
      .slice(0, limit);
  }

  const rows = getDatabase()
    .prepare(
      `
        SELECT entity_embeddings.entity_id AS entityId, vec_embeddings.distance AS distance
        FROM vec_embeddings
        JOIN entity_embeddings ON entity_embeddings.rowid = vec_embeddings.rowid
        WHERE vec_embeddings.embedding MATCH ?
          AND entity_embeddings.entity_type = ?
        ORDER BY distance
        LIMIT ?
      `,
    )
    .all(JSON.stringify(queryEmbedding), entityType, limit) as Array<{
      entityId: string;
      distance: number;
    }>;

  return rows;
}

function cosineDistance(left: number[], right: number[]): number {
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (!leftMagnitude || !rightMagnitude) {
    return 1;
  }

  return 1 - dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}
