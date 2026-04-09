import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { and, eq, isNull } from "drizzle-orm";

import { config } from "../config.js";
import { getOrm } from "../db/connection.js";
import { documents } from "../db/schema/index.js";
import { computeEmbeddingText, isBenignEmbeddingSyncError, upsertEmbedding } from "../lib/embeddings.js";
import { createPrefixedId } from "../lib/ids.js";
import { applySimilarityFilter, matchesResolvedDateFilters, resolveListFilters, type ListFilters } from "../lib/list-filters.js";
import { logger } from "../lib/logger.js";
import { createSlug } from "../lib/slug-ids.js";
import type { DocumentUploadInput } from "@warehouse-hub/business-schemas";
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
    ocrText: record.ocrText,
    ocrError: record.ocrError,
    ocrEngine: record.ocrEngine,
    ocrCompletedAt: record.ocrCompletedAt,
    extractedData: record.extractedDataJson ? (JSON.parse(record.extractedDataJson) as unknown) : null,
    linkedEntityType: record.linkedEntityType,
    linkedEntityId: record.linkedEntityId,
    createdAt: record.createdAt,
  };
}

function scheduleEmbedding(documentId: string, payload: ReturnType<typeof mapDocument>): void {
  void upsertEmbedding("document", documentId, computeEmbeddingText("document", payload)).catch((error) => {
    if (isBenignEmbeddingSyncError(error)) {
      return;
    }
    logger.warn("Failed to sync document embedding", { documentId, error });
  });
}

type CreateStoredDocumentInput = {
  kind: DocumentUploadInput["kind"];
  source?: string;
};

type DocumentProcessingPatch = {
  storageStatus?: string;
  ocrStatus?: string;
  ocrText?: string | null;
  ocrError?: string | null;
  ocrEngine?: string | null;
  ocrCompletedAt?: string | null;
  extractedData?: unknown;
  linkedEntityType?: string | null;
  linkedEntityId?: string | null;
};

export function createStoredDocument(file: Express.Multer.File, meta: CreateStoredDocumentInput) {
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

export function updateDocumentProcessing(idOrSlug: string, patch: DocumentProcessingPatch) {
  const existing = requireDocumentRecord(idOrSlug);
  getOrm()
    .update(documents)
    .set({
      storageStatus: patch.storageStatus ?? existing.storageStatus,
      ocrStatus: patch.ocrStatus ?? existing.ocrStatus,
      ocrText: patch.ocrText === undefined ? existing.ocrText : patch.ocrText,
      ocrError: patch.ocrError === undefined ? existing.ocrError : patch.ocrError,
      ocrEngine: patch.ocrEngine === undefined ? existing.ocrEngine : patch.ocrEngine,
      ocrCompletedAt: patch.ocrCompletedAt === undefined ? existing.ocrCompletedAt : patch.ocrCompletedAt,
      extractedDataJson:
        patch.extractedData === undefined
          ? existing.extractedDataJson
          : patch.extractedData === null
            ? null
            : JSON.stringify(patch.extractedData),
      linkedEntityType: patch.linkedEntityType === undefined ? existing.linkedEntityType : patch.linkedEntityType,
      linkedEntityId: patch.linkedEntityId === undefined ? existing.linkedEntityId : patch.linkedEntityId,
    })
    .where(eq(documents.id, existing.id))
    .run();

  const updated = getDocumentMeta(existing.id);
  scheduleEmbedding(existing.id, updated);
  return updated;
}

export function uploadDocument(file: Express.Multer.File, meta: DocumentUploadInput) {
  return createStoredDocument(file, meta);
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

export async function listDocuments(filters: ListFilters = {}) {
  const resolvedFilters = resolveListFilters(filters);
  const items = getOrm()
    .select()
    .from(documents)
    .where(and(isNull(documents.deletedAt)))
    .all()
    .map(mapDocument)
    .filter((document) => matchesResolvedDateFilters(document.createdAt, resolvedFilters));

  return applySimilarityFilter(items, {
    entityType: "document",
    similar: resolvedFilters.similar,
    limit: resolvedFilters.limit,
    getEntityId: (document) => document.documentId,
  });
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
