import { eq, isNull } from "drizzle-orm";

import { getOrm } from "../db/connection.js";
import { projects } from "../db/schema/index.js";
import { createPrefixedId } from "../lib/ids.js";
import { createSlug } from "../lib/slug-ids.js";

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

export function listProjects(): Array<typeof projects.$inferSelect> {
  return getOrm().select().from(projects).where(isNull(projects.deletedAt)).all();
}
