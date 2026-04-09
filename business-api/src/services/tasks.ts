import { and, eq, isNull } from "drizzle-orm";

import { getOrm } from "../db/connection.js";
import { tasks } from "../db/schema/index.js";
import { computeEmbeddingText, isBenignEmbeddingSyncError, upsertEmbedding } from "../lib/embeddings.js";
import { AppError } from "../lib/errors.js";
import { createPrefixedId } from "../lib/ids.js";
import { logger } from "../lib/logger.js";
import { createSlug } from "../lib/slug-ids.js";
import type { TaskInput, TaskPatch } from "@warehouse-hub/business-schemas";
import { requireProjectRecord, requireTaskRecord } from "./shared.js";

function mapTask(record: typeof tasks.$inferSelect) {
  return {
    taskId: record.id,
    slug: record.slug,
    projectId: record.projectId,
    parentTaskId: record.parentTaskId,
    title: record.title,
    description: record.description,
    status: record.status,
    priority: record.priority,
    dueDate: record.dueDate,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function scheduleEmbedding(taskId: string, payload: ReturnType<typeof getTask>): void {
  void upsertEmbedding("task", taskId, computeEmbeddingText("task", payload)).catch((error) => {
    if (isBenignEmbeddingSyncError(error)) {
      return;
    }
    logger.warn("Failed to sync task embedding", { taskId, error });
  });
}

function validateParentTask(projectId: string, parentTaskId: string | undefined): void {
  if (!parentTaskId) {
    return;
  }

  const parent = requireTaskRecord(parentTaskId);
  if (parent.projectId !== projectId) {
    throw new AppError("Parent task must belong to the same project", {
      statusCode: 400,
      code: "invalid_parent_task",
    });
  }
}

function assertTaskTransition(fromStatus: string, toStatus: string): void {
  const allowedTransitions: Record<string, string[]> = {
    open: ["open", "in_progress", "done", "cancelled"],
    in_progress: ["in_progress", "done", "cancelled"],
    done: ["done"],
    cancelled: ["cancelled"],
  };

  if (!allowedTransitions[fromStatus]?.includes(toStatus)) {
    throw new AppError(`Invalid task status transition: ${fromStatus} -> ${toStatus}`, {
      statusCode: 409,
      code: "invalid_status_transition",
    });
  }
}

export function createTask(data: TaskInput) {
  requireProjectRecord(data.projectId);
  validateParentTask(data.projectId, data.parentTaskId);

  const id = createPrefixedId("task_");
  const now = new Date().toISOString();
  getOrm()
    .insert(tasks)
    .values({
      id,
      slug: createSlug(`${data.projectId}:${data.title}:${id}`),
      projectId: data.projectId,
      parentTaskId: data.parentTaskId ?? null,
      title: data.title,
      description: data.description ?? null,
      status: data.status,
      priority: data.priority,
      dueDate: data.dueDate ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    .run();

  const created = getTask(id);
  scheduleEmbedding(id, created);
  return created;
}

export function listTasks(filters: { projectId?: string; status?: string; parentTaskId?: string } = {}) {
  const conditions = [isNull(tasks.deletedAt)];
  if (filters.projectId) {
    conditions.push(eq(tasks.projectId, filters.projectId));
  }
  if (filters.status) {
    conditions.push(eq(tasks.status, filters.status));
  }
  if (filters.parentTaskId !== undefined) {
    if (filters.parentTaskId === "null") {
      conditions.push(isNull(tasks.parentTaskId));
    } else {
      conditions.push(eq(tasks.parentTaskId, filters.parentTaskId));
    }
  }

  return getOrm().select().from(tasks).where(and(...conditions)).all().map(mapTask);
}

export function getTask(idOrSlug: string) {
  const task = requireTaskRecord(idOrSlug);
  const subtasks = getOrm()
    .select()
    .from(tasks)
    .where(and(eq(tasks.parentTaskId, task.id), isNull(tasks.deletedAt)))
    .all()
    .map(mapTask);

  return {
    ...mapTask(task),
    subtasks,
  };
}

export function updateTask(idOrSlug: string, patch: TaskPatch) {
  const existing = requireTaskRecord(idOrSlug);
  const nextProjectId = patch.projectId ?? existing.projectId;
  requireProjectRecord(nextProjectId);
  validateParentTask(nextProjectId, patch.parentTaskId ?? existing.parentTaskId ?? undefined);

  if (patch.status) {
    assertTaskTransition(existing.status, patch.status);
  }

  getOrm()
    .update(tasks)
    .set({
      projectId: nextProjectId,
      parentTaskId: patch.parentTaskId ?? existing.parentTaskId,
      title: patch.title ?? existing.title,
      description: patch.description ?? existing.description,
      status: patch.status ?? existing.status,
      priority: patch.priority ?? existing.priority,
      dueDate: patch.dueDate ?? existing.dueDate,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(tasks.id, existing.id))
    .run();

  const updated = getTask(existing.id);
  scheduleEmbedding(existing.id, updated);
  return updated;
}

export function softDeleteTask(idOrSlug: string) {
  const existing = requireTaskRecord(idOrSlug);
  getOrm()
    .update(tasks)
    .set({
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(tasks.id, existing.id))
    .run();
}
