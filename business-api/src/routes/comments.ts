import { Router } from "express";

import { commentInputSchema, commentPatchSchema, type CommentableType } from "@warehouse-hub/business-schemas";
import { AppError } from "../lib/errors.js";
import { validateBody } from "../middleware/validate.js";
import { createComment, getComment, listComments, softDeleteComment, updateComment } from "../services/comments.js";

export const commentsRouter = Router();

function getRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

function parseCommentableType(value: unknown): CommentableType | undefined {
  switch (value) {
    case "company_card":
    case "contact":
    case "document":
    case "expense":
    case "payroll":
    case "deal":
    case "booking":
    case "sales_invoice":
    case "project":
    case "task":
      return value;
    default:
      return undefined;
  }
}

commentsRouter.get("/", (request, response) => {
  const rawCommentableType =
    typeof request.query.commentableType === "string" ? request.query.commentableType : undefined;
  const commentableType = parseCommentableType(rawCommentableType);
  if (rawCommentableType && !commentableType) {
    throw new AppError(`Unsupported commentable type: ${rawCommentableType}`, {
      statusCode: 400,
      code: "validation_error",
    });
  }

  response.json(
    listComments({
      commentableType,
      commentableId:
        typeof request.query.commentableId === "string" ? request.query.commentableId : undefined,
      commentableSlug:
        typeof request.query.commentableSlug === "string" ? request.query.commentableSlug : undefined,
      authorContactId:
        typeof request.query.authorContactId === "string" ? request.query.authorContactId : undefined,
    }),
  );
});

commentsRouter.post("/", validateBody(commentInputSchema), (request, response) => {
  response.status(201).json(createComment(request.body));
});

commentsRouter.get("/:id", (request, response) => {
  response.json(getComment(getRouteParam(request.params.id)));
});

commentsRouter.patch("/:id", validateBody(commentPatchSchema), (request, response) => {
  response.json(updateComment(getRouteParam(request.params.id), request.body));
});

commentsRouter.delete("/:id", (request, response) => {
  softDeleteComment(getRouteParam(request.params.id));
  response.status(204).send();
});
