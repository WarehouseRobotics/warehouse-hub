import { createHash } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { getDatabase, getOrm, getVectorBackend } from "../db/connection.js";
import { entityEmbeddings } from "../db/schema/index.js";
import { createPrefixedId } from "./ids.js";

export type EmbeddingEntityType = "company_card" | "contact" | "document" | "deal" | "task";

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
      return [entity.kind, entity.source, entity.originalFilename, entity.mimeType].filter(Boolean).join(" ");
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
    case "task":
      return [entity.title, entity.description, entity.status, entity.priority].filter(Boolean).join(" ");
  }
}

export function upsertEmbedding(entityType: EmbeddingEntityType, entityId: string, text: string): void {
  const contentHash = hashEmbeddingContent(text);
  const db = getOrm();
  const sqlite = getDatabase();
  const now = new Date().toISOString();
  const existing = db
    .select()
    .from(entityEmbeddings)
    .where(and(eq(entityEmbeddings.entityType, entityType), eq(entityEmbeddings.entityId, entityId)))
    .get();

  if (existing && existing.contentHash === contentHash) {
    return;
  }

  const embeddingJson = JSON.stringify(createStubEmbedding(text));

  if (existing) {
    db.update(entityEmbeddings)
      .set({
        contentHash,
        model: "stub-embedding-v1",
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
  db.insert(entityEmbeddings)
    .values({
      id: embeddingId,
      entityType,
      entityId,
      contentHash,
      model: "stub-embedding-v1",
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
}

export function findSimilar(
  entityType: EmbeddingEntityType,
  query: string,
  limit = 5,
): Array<{ entityId: string; distance: number }> {
  const queryEmbedding = createStubEmbedding(query);
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
