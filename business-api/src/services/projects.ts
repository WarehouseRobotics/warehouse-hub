import { and, eq, isNull, sql } from "drizzle-orm";

import { getOrm } from "../db/connection.js";
import { projects, tasks } from "../db/schema/index.js";
import { AppError } from "../lib/errors.js";
import { createPrefixedId } from "../lib/ids.js";
import { createSlug } from "../lib/slug-ids.js";
import type { ProjectInput, ProjectPatch } from "@warehouse-hub/business-schemas";
import { requireCompanyCardRecord, requireContactRecord, requireProjectRecord } from "./shared.js";

function mapProject(record: typeof projects.$inferSelect) {
  const counts = getOrm()
    .select({
      total: sql<number>`count(*)`,
      open: sql<number>`sum(case when ${tasks.status} = 'open' then 1 else 0 end)`,
      inProgress: sql<number>`sum(case when ${tasks.status} = 'in_progress' then 1 else 0 end)`,
      done: sql<number>`sum(case when ${tasks.status} = 'done' then 1 else 0 end)`,
      cancelled: sql<number>`sum(case when ${tasks.status} = 'cancelled' then 1 else 0 end)`,
    })
    .from(tasks)
    .where(and(eq(tasks.projectId, record.id), isNull(tasks.deletedAt)))
    .get();

  return {
    projectId: record.id,
    slug: record.slug,
    ownerEntityId: record.ownerEntityId,
    ownerEntityType: record.ownerEntityType,
    name: record.name,
    description: record.description,
    status: record.status,
    taskSummary: {
      total: counts?.total ?? 0,
      open: counts?.open ?? 0,
      inProgress: counts?.inProgress ?? 0,
      done: counts?.done ?? 0,
      cancelled: counts?.cancelled ?? 0,
    },
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function validateProjectOwner(ownerEntityId: string, ownerEntityType: "company_card" | "contact"): void {
  if (ownerEntityType === "company_card") {
    const company = requireCompanyCardRecord();
    if (company.id !== ownerEntityId) {
      throw new AppError(`Unknown company owner: ${ownerEntityId}`, {
        statusCode: 400,
        code: "invalid_owner",
      });
    }
    return;
  }

  requireContactRecord(ownerEntityId);
}

export function ensureDefaultTasksProject(ownerEntityId: string): void {
  const db = getOrm();
  const existing = db
    .select()
    .from(projects)
    .where(eq(projects.ownerEntityId, ownerEntityId))
    .get();

  if (existing) {
    return;
  }

  const now = new Date().toISOString();
  db.insert(projects).values({
    id: createPrefixedId("proj_"),
    slug: createSlug(`${ownerEntityId}:tasks`),
    ownerEntityId,
    ownerEntityType: "company_card",
    name: "Tasks",
    description: "Default internal tasks project",
    status: "active",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }).run();
}

export function createProject(data: ProjectInput) {
  validateProjectOwner(data.ownerEntityId, data.ownerEntityType);
  const id = createPrefixedId("proj_");
  const now = new Date().toISOString();

  getOrm()
    .insert(projects)
    .values({
      id,
      slug: createSlug(`${data.ownerEntityId}:${data.name}:${id}`),
      ownerEntityId: data.ownerEntityId,
      ownerEntityType: data.ownerEntityType,
      name: data.name,
      description: data.description ?? null,
      status: data.status,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    .run();

  return getProject(id);
}

export function listProjects(filters: { ownerEntityId?: string; status?: string } = {}) {
  const conditions = [isNull(projects.deletedAt)];
  if (filters.ownerEntityId) {
    conditions.push(eq(projects.ownerEntityId, filters.ownerEntityId));
  }
  if (filters.status) {
    conditions.push(eq(projects.status, filters.status));
  }

  return getOrm().select().from(projects).where(and(...conditions)).all().map(mapProject);
}

export function getProject(idOrSlug: string) {
  return mapProject(requireProjectRecord(idOrSlug));
}

export function updateProject(idOrSlug: string, patch: ProjectPatch) {
  const existing = requireProjectRecord(idOrSlug);

  if (patch.ownerEntityId || patch.ownerEntityType) {
    validateProjectOwner(
      patch.ownerEntityId ?? existing.ownerEntityId,
      (patch.ownerEntityType ?? existing.ownerEntityType) as "company_card" | "contact",
    );
  }

  getOrm()
    .update(projects)
    .set({
      ownerEntityId: patch.ownerEntityId ?? existing.ownerEntityId,
      ownerEntityType: patch.ownerEntityType ?? existing.ownerEntityType,
      name: patch.name ?? existing.name,
      description: patch.description ?? existing.description,
      status: patch.status ?? existing.status,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(projects.id, existing.id))
    .run();

  return getProject(existing.id);
}

export function softDeleteProject(idOrSlug: string) {
  const existing = requireProjectRecord(idOrSlug);
  getOrm()
    .update(projects)
    .set({
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(projects.id, existing.id))
    .run();
}
