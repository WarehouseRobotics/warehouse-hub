import multer from "multer";
import { Router } from "express";

import { parseListFilters } from "../lib/list-filters.js";
import { documentIngestSchema, documentUploadSchema } from "@warehouse-hub/business-schemas";
import { getDocumentDownload, getDocumentMeta, listDocuments, softDeleteDocument, uploadDocument } from "../services/documents.js";
import { ingestDocument } from "../services/document-ingestion.js";

export const documentsRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });

function getRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

function parseMultipartJson<T>(value: T | string | undefined): T | undefined {
  if (typeof value !== "string") {
    return value;
  }

  return JSON.parse(value) as T;
}

documentsRouter.post("/", upload.single("file"), (request, response) => {
  if (!request.file) {
    response.status(400).json({
      error: {
        code: "validation_error",
        message: "Missing uploaded file",
      },
    });
    return;
  }

  const meta = documentUploadSchema.parse(request.body);
  response.status(201).json(uploadDocument(request.file, meta));
});

documentsRouter.get("/", async (request, response, next) => {
  try {
    response.json(
      await listDocuments(
        parseListFilters({
          similar: typeof request.query.similar === "string" ? request.query.similar : undefined,
          limit: typeof request.query.limit === "string" ? request.query.limit : undefined,
          since: typeof request.query.since === "string" ? request.query.since : undefined,
          before: typeof request.query.before === "string" ? request.query.before : undefined,
          after: typeof request.query.after === "string" ? request.query.after : undefined,
        }),
      ),
    );
  } catch (error) {
    next(error);
  }
});

documentsRouter.post("/ingest", upload.single("file"), async (request, response, next) => {
  try {
    if (!request.file) {
      response.status(400).json({
        error: {
          code: "validation_error",
          message: "Missing uploaded file",
        },
      });
      return;
    }

    const meta = documentIngestSchema.parse({
      kind: request.body.kind,
      companyCardId: request.body.companyCardId,
      source: request.body.source,
      targetSalesInvoiceId: request.body.targetSalesInvoiceId,
      overrides: parseMultipartJson(request.body.overrides),
    });

    response.status(201).json(await ingestDocument(request.file, meta));
  } catch (error) {
    next(error);
  }
});

documentsRouter.get("/:id", (request, response) => {
  response.json(getDocumentMeta(getRouteParam(request.params.id)));
});

documentsRouter.get("/:id/download", (request, response) => {
  const document = getDocumentDownload(getRouteParam(request.params.id));
  response.type(document.mimeType);
  response.download(document.path, document.filename);
});

documentsRouter.delete("/:id", (request, response) => {
  softDeleteDocument(getRouteParam(request.params.id));
  response.status(204).send();
});
