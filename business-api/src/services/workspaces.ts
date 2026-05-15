import { eq, isNull } from "drizzle-orm";

import { config } from "../config.js";
import { getOrm } from "../db/connection.js";
import { users, workspaces } from "../db/schema/index.js";
import { AppError } from "../lib/errors.js";
import { createPrefixedId } from "../lib/ids.js";
import { hashPassword } from "../lib/passwords.js";

export type Workspace = {
  id: string;
  slug: string;
  name: string;
  createdAt: string;
  deletedAt: string | null;
};

function mapWorkspace(record: typeof workspaces.$inferSelect): Workspace {
  return {
    id: record.id,
    slug: record.slug,
    name: record.name,
    createdAt: record.createdAt,
    deletedAt: record.deletedAt,
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function displayNameFromEmail(email: string): string {
  return email.split("@")[0] || email;
}

function getAnyWorkspaceRecord() {
  return getOrm().select().from(workspaces).get();
}

function getWorkspaceRecordBySlug(slug: string) {
  return getOrm().select().from(workspaces).where(eq(workspaces.slug, slug)).get();
}

function getActiveWorkspaceRecord() {
  return getOrm().select().from(workspaces).where(isNull(workspaces.deletedAt)).get();
}

function ensureBootstrapOwner(workspaceId: string): void {
  if (!config.BOOTSTRAP_OWNER_EMAIL) {
    return;
  }

  const email = normalizeEmail(config.BOOTSTRAP_OWNER_EMAIL);
  const existing = getOrm().select().from(users).where(eq(users.email, email)).get();
  if (existing) {
    return;
  }

  const createdAt = new Date().toISOString();
  const passwordHash = config.BOOTSTRAP_OWNER_PASSWORD ? hashPassword(config.BOOTSTRAP_OWNER_PASSWORD) : null;

  getOrm()
    .insert(users)
    .values({
      id: createPrefixedId("usr_"),
      workspaceId,
      email,
      displayName: displayNameFromEmail(email),
      passwordHash,
      role: "owner",
      createdAt,
      lastLoginAt: null,
      deletedAt: null,
    })
    .run();
}

export function bootstrapWorkspace(): Workspace {
  const existing = getAnyWorkspaceRecord();
  if (existing) {
    ensureBootstrapOwner(existing.id);
    return mapWorkspace(existing);
  }

  const now = new Date().toISOString();
  const workspaceRecord = {
    id: createPrefixedId("ws_"),
    slug: config.WORKSPACE_SLUG,
    name: config.WORKSPACE_NAME,
    createdAt: now,
    deletedAt: null,
  };

  getOrm()
    .insert(workspaces)
    .values(workspaceRecord)
    .onConflictDoNothing({ target: workspaces.slug })
    .run();

  const persisted = getWorkspaceRecordBySlug(workspaceRecord.slug);
  if (!persisted) {
    throw new AppError("Workspace bootstrap failed", {
      statusCode: 500,
      code: "workspace_bootstrap_failed",
    });
  }

  ensureBootstrapOwner(persisted.id);

  return mapWorkspace(persisted);
}

export function getWorkspace(): Workspace {
  const record = getActiveWorkspaceRecord();
  if (!record) {
    throw new AppError("Workspace has not been bootstrapped", {
      statusCode: 500,
      code: "workspace_not_bootstrapped",
    });
  }

  return mapWorkspace(record);
}

export function updateWorkspace(input: { name?: string; slug?: string }): Workspace {
  const existing = getActiveWorkspaceRecord();
  if (!existing) {
    throw new AppError("Workspace has not been bootstrapped", {
      statusCode: 500,
      code: "workspace_not_bootstrapped",
    });
  }

  const updates = {
    name: input.name ?? existing.name,
    slug: input.slug ?? existing.slug,
  };

  getOrm().update(workspaces).set(updates).where(eq(workspaces.id, existing.id)).run();

  return {
    ...mapWorkspace(existing),
    ...updates,
  };
}
