import { and, desc, eq, isNull, or } from "drizzle-orm";

import { getOrm } from "../db/connection.js";
import { comments } from "../db/schema/index.js";
import { AppError } from "../lib/errors.js";
import { createPrefixedId } from "../lib/ids.js";
import { createSlug } from "../lib/slug-ids.js";
import type { CommentInput, CommentPatch, CommentableType } from "@warehouse-hub/business-schemas";
import { requireContactRecord, resolveCommentableRecord } from "./shared.js";

function mapComment(record: typeof comments.$inferSelect) {
  return {
    commentId: record.id,
    slug: record.slug,
    commentableType: record.commentableType as CommentableType,
    commentableId: record.commentableId,
    commentableSlug: record.commentableSlug,
    body: record.body,
    authorName: record.authorName,
    authorContactId: record.authorContactId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function getCommentRecordByIdOrSlug(idOrSlug: string) {
  return getOrm()
    .select()
    .from(comments)
    .where(and(isNull(comments.deletedAt), or(eq(comments.id, idOrSlug), eq(comments.slug, idOrSlug))))
    .get();
}

function requireCommentRecord(idOrSlug: string) {
  const record = getCommentRecordByIdOrSlug(idOrSlug);
  if (!record) {
    throw new AppError(`Comment not found: ${idOrSlug}`, { statusCode: 404, code: "not_found" });
  }

  return record;
}

function resolveAuthorContactId(input: {
  authorContactId?: string | null;
  authorContactSlug?: string | null;
}): string | null {
  if (input.authorContactId !== undefined) {
    if (input.authorContactId === null) {
      return null;
    }

    return requireContactRecord(input.authorContactId).id;
  }

  if (input.authorContactSlug !== undefined) {
    if (input.authorContactSlug === null) {
      return null;
    }

    return requireContactRecord(input.authorContactSlug).id;
  }

  return null;
}

export function createComment(data: CommentInput) {
  const target = resolveCommentableRecord(data.commentableType, data.commentableId ?? data.commentableSlug!);
  const authorContactId = resolveAuthorContactId({
    authorContactId: data.authorContactId,
    authorContactSlug: data.authorContactSlug,
  });
  const id = createPrefixedId("cmt_");
  const now = new Date().toISOString();

  getOrm()
    .insert(comments)
    .values({
      id,
      slug: createSlug(`${data.commentableType}:${target.slug}:${id}`),
      commentableType: data.commentableType,
      commentableId: target.id,
      commentableSlug: target.slug,
      body: data.body,
      authorName: data.authorName,
      authorContactId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    .run();

  return getComment(id);
}

export function listComments(filters: {
  commentableType?: CommentableType;
  commentableId?: string;
  commentableSlug?: string;
  authorContactId?: string;
} = {}) {
  if ((filters.commentableId || filters.commentableSlug) && !filters.commentableType) {
    throw new AppError("commentableType is required when filtering by comment target", {
      statusCode: 400,
      code: "validation_error",
    });
  }

  if (filters.commentableId && filters.commentableSlug) {
    throw new AppError("Provide at most one of commentableId or commentableSlug when listing comments", {
      statusCode: 400,
      code: "validation_error",
    });
  }

  const conditions = [isNull(comments.deletedAt)];

  if (filters.commentableType) {
    conditions.push(eq(comments.commentableType, filters.commentableType));
  }

  if (filters.commentableType && (filters.commentableId || filters.commentableSlug)) {
    const target = resolveCommentableRecord(
      filters.commentableType,
      filters.commentableId ?? filters.commentableSlug!,
    );
    conditions.push(eq(comments.commentableId, target.id));
  }

  if (filters.authorContactId) {
    conditions.push(eq(comments.authorContactId, filters.authorContactId));
  }

  return getOrm()
    .select()
    .from(comments)
    .where(and(...conditions))
    .orderBy(desc(comments.createdAt), desc(comments.id))
    .all()
    .map(mapComment);
}

export function getComment(idOrSlug: string) {
  return mapComment(requireCommentRecord(idOrSlug));
}

export function updateComment(idOrSlug: string, patch: CommentPatch) {
  const existing = requireCommentRecord(idOrSlug);
  const nextAuthorContactId =
    patch.authorContactId !== undefined || patch.authorContactSlug !== undefined
      ? resolveAuthorContactId({
          authorContactId: patch.authorContactId,
          authorContactSlug: patch.authorContactSlug,
        })
      : existing.authorContactId;

  getOrm()
    .update(comments)
    .set({
      body: patch.body ?? existing.body,
      authorName: patch.authorName ?? existing.authorName,
      authorContactId: nextAuthorContactId,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(comments.id, existing.id))
    .run();

  return getComment(existing.id);
}

export function softDeleteComment(idOrSlug: string) {
  const existing = requireCommentRecord(idOrSlug);

  getOrm()
    .update(comments)
    .set({
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(comments.id, existing.id))
    .run();
}
