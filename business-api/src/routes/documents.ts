import multer from "multer";
import { Router } from "express";

import { documentUploadSchema } from "../schemas/document.js";
import { getDocumentDownload, getDocumentMeta, softDeleteDocument, uploadDocument } from "../services/documents.js";

export const documentsRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });

function getRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
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
