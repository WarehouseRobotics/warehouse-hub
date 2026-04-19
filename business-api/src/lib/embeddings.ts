import { createHash } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { config } from "../config.js";
import { getDatabase, getOrm, getVectorBackend } from "../db/connection.js";
import { entityEmbeddings } from "../db/schema/index.js";
import { AppError } from "./errors.js";
import { createTextEmbedding } from "./embedding-provider.js";
import { createPrefixedId } from "./ids.js";
import { getConfiguredEmbeddingDimensions } from "./llm-config.js";
import { logger } from "./logger.js";

export type EmbeddingEntityType =
  | "company_card"
  | "contact"
  | "document"
  | "deal"
  | "expense_invoice"
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

function toSnakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .toLowerCase();
}

function normalizeEmbeddingValue(value: unknown): unknown {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  if (Array.isArray(value)) {
    const normalizedItems = value
      .map((item) => normalizeEmbeddingValue(item))
      .filter((item) => item !== undefined);

    return normalizedItems.length > 0 ? normalizedItems : undefined;
  }

  if (typeof value === "object") {
    const normalizedEntries = Object.entries(value).flatMap(([key, nestedValue]) => {
      const normalizedValue = normalizeEmbeddingValue(nestedValue);
      return normalizedValue === undefined ? [] : [[toSnakeCase(key), normalizedValue] as const];
    });

    return normalizedEntries.length > 0 ? Object.fromEntries(normalizedEntries) : undefined;
  }

  return value;
}

function formatYamlScalar(value: string | number | boolean): string {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  return String(value);
}

function toYaml(value: unknown, indent = 0): string {
  const prefix = " ".repeat(indent);

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (Array.isArray(item) || (typeof item === "object" && item !== null)) {
          return `${prefix}-\n${toYaml(item, indent + 2)}`;
        }

        return `${prefix}- ${formatYamlScalar(item as string | number | boolean)}`;
      })
      .join("\n");
  }

  if (typeof value === "object" && value !== null) {
    return Object.entries(value)
      .map(([key, nestedValue]) => {
        if (Array.isArray(nestedValue) || (typeof nestedValue === "object" && nestedValue !== null)) {
          return `${prefix}${key}:\n${toYaml(nestedValue, indent + 2)}`;
        }

        return `${prefix}${key}: ${formatYamlScalar(nestedValue as string | number | boolean)}`;
      })
      .join("\n");
  }

  return `${prefix}${formatYamlScalar(value as string | number | boolean)}`;
}

function createEmbeddingDocument(entityType: EmbeddingEntityType, entity: Record<string, unknown>): Record<string, unknown> {
  switch (entityType) {
    case "company_card":
      return {
        entityType,
        displayName: entity.displayName,
        legalName: entity.legalName,
        taxId: entity.taxId,
        email: entity.email,
        phone: entity.phone,
        website: entity.website,
      };
    case "contact":
      return {
        entityType,
        displayName: entity.displayName,
        legalName: entity.legalName,
        roles: entity.roles,
        taxId: entity.taxId,
        email: entity.email,
        notes: entity.notes,
      };
    case "document":
      return {
        entityType,
        kind: entity.kind,
        source: entity.source,
        originalFilename: entity.originalFilename,
        filename: entity.filename,
        mimeType: entity.mimeType,
        ocrStatus: entity.ocrStatus,
        ocrText: entity.ocrText,
        extractedData: entity.extractedData,
      };
    case "expense_invoice":
      return {
        entityType,
        supplierDisplayName: entity.supplierDisplayName,
        supplierLegalName: entity.supplierLegalName,
        supplierEmail: entity.supplierEmail,
        invoiceNumber: entity.invoiceNumber,
        invoiceDate: entity.invoiceDate,
        dueDate: entity.dueDate,
        currency: entity.currency,
        net: entity.net,
        tax: entity.tax,
        gross: entity.gross,
        taxLines: entity.taxLines,
        lineItems: entity.lineItems,
        category: entity.category,
        notes: entity.notes,
        status: entity.status,
      };
    case "deal":
      return {
        entityType,
        title: entity.title,
        stage: entity.stage,
        notes: entity.notes,
        lineItems: entity.lineItems,
      };
    case "sales_invoice":
      return {
        entityType,
        invoiceNumber: entity.invoiceNumber,
        status: entity.status,
        customerDisplayName: entity.customerDisplayName,
        customerLegalName: entity.customerLegalName,
        customerEmail: entity.customerEmail,
        currency: entity.currency,
        issueDate: entity.issueDate,
        serviceDate: entity.serviceDate,
        dueDate: entity.dueDate,
        notes: entity.notes,
        lineItems: entity.lineItems,
      };
    case "task":
      return {
        entityType,
        title: entity.title,
        description: entity.description,
        status: entity.status,
        priority: entity.priority,
      };
  }
}

export function computeEmbeddingText(entityType: EmbeddingEntityType, entity: Record<string, unknown>): string {
  const normalizedDocument = normalizeEmbeddingValue(createEmbeddingDocument(entityType, entity));
  return typeof normalizedDocument === "object" && normalizedDocument ? toYaml(normalizedDocument) : "";
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

function replaceVectorRow(rowid: number, embeddingJson: string): void {
  const sqlite = getDatabase();
  sqlite.prepare("DELETE FROM vec_embeddings WHERE rowid = ?").run(rowid);
  sqlite
    .prepare("INSERT INTO vec_embeddings(rowid, embedding) VALUES (CAST(? AS INTEGER), ?)")
    .run(rowid, embeddingJson);
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
      replaceVectorRow(existingRow.rowid, embeddingJson);
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
        .prepare("INSERT INTO vec_embeddings(rowid, embedding) VALUES (CAST(? AS INTEGER), ?)")
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
      replaceVectorRow(existingRow.rowid, embeddingJson);
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
        SELECT entity_embeddings.entity_id AS entityId, candidates.distance AS distance
        FROM (
          SELECT rowid, distance
          FROM vec_embeddings
          WHERE embedding MATCH ?
          ORDER BY distance
          LIMIT ?
        ) AS candidates
        JOIN entity_embeddings ON entity_embeddings.rowid = candidates.rowid
        WHERE entity_embeddings.entity_type = ?
        ORDER BY candidates.distance
      `,
    )
    .all(JSON.stringify(queryEmbedding), limit, entityType) as Array<{
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
