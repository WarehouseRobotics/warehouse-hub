import { Router } from "express";

import { commentInputSchema, commentPatchSchema, type CommentableType } from "@warehouse-hub/business-schemas";
import { AppError } from "../lib/errors.js";
import { requireScope } from "../middleware/auth.js";
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

commentsRouter.get("/", requireScope("read"), (request, response) => {
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

commentsRouter.post("/", requireScope("write"), validateBody(commentInputSchema), (request, response) => {
  const comment = createComment(request.body);
  response.locals.audit = {
    action: "comment.create",
    objectType: "comment",
    objectId: comment.commentId,
  };
  response.status(201).json(comment);
});

commentsRouter.get("/:id", requireScope("read"), (request, response) => {
  response.json(getComment(getRouteParam(request.params.id)));
});

commentsRouter.patch("/:id", requireScope("write"), validateBody(commentPatchSchema), (request, response) => {
  const comment = updateComment(getRouteParam(request.params.id), request.body);
  response.locals.audit = {
    action: "comment.update",
    objectType: "comment",
    objectId: comment.commentId,
  };
  response.json(comment);
});

commentsRouter.delete("/:id", requireScope("write"), (request, response) => {
  const id = getRouteParam(request.params.id);
  const comment = getComment(id);
  softDeleteComment(id);
  response.locals.audit = {
    action: "comment.delete",
    objectType: "comment",
    objectId: comment.commentId,
  };
  response.status(204).send();
});
