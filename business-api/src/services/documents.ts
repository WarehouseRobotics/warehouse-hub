import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { and, eq, isNull } from "drizzle-orm";

import { config } from "../config.js";
import { getOrm } from "../db/connection.js";
import { documents } from "../db/schema/index.js";
import { computeEmbeddingText, isBenignEmbeddingSyncError, upsertEmbedding } from "../lib/embeddings.js";
import { createPrefixedId } from "../lib/ids.js";
import { createSlug } from "../lib/slug-ids.js";
import type { DocumentUploadInput } from "../schemas/document.js";
import { requireCompanyCardRecord, requireDocumentRecord } from "./shared.js";

function mapDocument(record: typeof documents.$inferSelect) {
  return {
    documentId: record.id,
    slug: record.slug,
    kind: record.kind,
    source: record.source,
    filename: record.originalFilename,
    mimeType: record.mimeType,
    storageStatus: record.storageStatus,
    ocrStatus: record.ocrStatus,
    createdAt: record.createdAt,
  };
}

function scheduleEmbedding(documentId: string, payload: ReturnType<typeof mapDocument>): void {
  void upsertEmbedding("document", documentId, computeEmbeddingText("document", payload)).catch((error) => {
    if (isBenignEmbeddingSyncError(error)) {
      return;
    }
    console.warn(`Failed to sync document embedding for ${documentId}:`, error);
  });
}

export function uploadDocument(file: Express.Multer.File, meta: DocumentUploadInput) {
  const company = requireCompanyCardRecord();
  const documentId = createPrefixedId("doc_");
  const now = new Date().toISOString();
  const slug = createSlug(`${meta.kind}:${file.originalname}:${documentId}`);
  const checksum = createHash("sha256").update(file.buffer).digest("hex");
  const documentsDir = path.join(config.uploadDir, "documents");
  const extension = path.extname(file.originalname);
  const targetPath = path.join(documentsDir, `${documentId}${extension}`);

  fs.mkdirSync(documentsDir, { recursive: true });
  fs.writeFileSync(targetPath, file.buffer);

  getOrm()
    .insert(documents)
    .values({
      id: documentId,
      slug,
      companyCardId: company.id,
      kind: meta.kind,
      source: meta.source ?? null,
      originalFilename: file.originalname,
      mimeType: file.mimetype || "application/octet-stream",
      filePath: targetPath,
      checksum,
      storageStatus: "stored",
      ocrStatus: "pending",
      createdAt: now,
      deletedAt: null,
    })
    .run();

  const created = getDocumentMeta(documentId);
  scheduleEmbedding(documentId, created);
  return created;
}

export function getDocumentMeta(idOrSlug: string) {
  return mapDocument(requireDocumentRecord(idOrSlug));
}

export function getDocumentDownload(idOrSlug: string) {
  const document = requireDocumentRecord(idOrSlug);
  return {
    path: document.filePath,
    filename: document.originalFilename,
    mimeType: document.mimeType,
  };
}

export function listDocuments() {
  return getOrm()
    .select()
    .from(documents)
    .where(and(isNull(documents.deletedAt)))
    .all()
    .map(mapDocument);
}

export function softDeleteDocument(idOrSlug: string) {
  const existing = requireDocumentRecord(idOrSlug);
  getOrm()
    .update(documents)
    .set({
      deletedAt: new Date().toISOString(),
    })
    .where(eq(documents.id, existing.id))
    .run();
}
