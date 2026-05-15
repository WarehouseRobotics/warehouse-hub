import { createRequire } from "node:module";

import type bcrypt from "bcrypt";
import { and, asc, eq, isNull } from "drizzle-orm";

import { getOrm } from "../db/connection.js";
import { users, type UserRole } from "../db/schema/index.js";
import { AppError } from "../lib/errors.js";
import { createPrefixedId } from "../lib/ids.js";
import { getWorkspace } from "./workspaces.js";
import { requireUserRecord } from "./shared.js";

const PASSWORD_HASH_ROUNDS = 12;
const require = createRequire(import.meta.url);

export type User = {
  userId: string;
  workspaceId: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
  lastLoginAt: string | null;
  deletedAt: string | null;
};

export type UserInput = {
  email: string;
  displayName: string;
  password?: string | null;
  role: UserRole;
  workspaceId?: string;
};

export type UserPatch = {
  displayName?: string;
  password?: string | null;
  role?: UserRole;
};

function getBcrypt(): typeof bcrypt {
  return require("bcrypt") as typeof bcrypt;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashPassword(password: string): string {
  return getBcrypt().hashSync(password, PASSWORD_HASH_ROUNDS);
}

function mapPasswordHash(password: string | null | undefined): string | null {
  if (password === undefined || password === null) {
    return null;
  }

  return hashPassword(password);
}

function mapUser(record: typeof users.$inferSelect): User {
  return {
    userId: record.id,
    workspaceId: record.workspaceId,
    email: record.email,
    displayName: record.displayName,
    role: record.role,
    createdAt: record.createdAt,
    lastLoginAt: record.lastLoginAt,
    deletedAt: record.deletedAt,
  };
}

export function createUser(input: UserInput): User {
  const now = new Date().toISOString();
  const id = createPrefixedId("usr_");
  const workspaceId = input.workspaceId ?? getWorkspace().id;

  getOrm()
    .insert(users)
    .values({
      id,
      workspaceId,
      email: normalizeEmail(input.email),
      displayName: input.displayName,
      passwordHash: mapPasswordHash(input.password),
      role: input.role,
      createdAt: now,
      lastLoginAt: null,
      deletedAt: null,
    })
    .run();

  return getUser(id);
}

export function listUsers(): User[] {
  return getOrm()
    .select()
    .from(users)
    .where(isNull(users.deletedAt))
    .orderBy(asc(users.createdAt), asc(users.id))
    .all()
    .map(mapUser);
}

export function getUser(idOrEmail: string): User {
  return mapUser(requireUserRecord(idOrEmail));
}

export function updateUser(idOrEmail: string, patch: UserPatch): User {
  const existing = requireUserRecord(idOrEmail);
  const passwordHash =
    patch.password === undefined
      ? existing.passwordHash
      : mapPasswordHash(patch.password);

  getOrm()
    .update(users)
    .set({
      displayName: patch.displayName ?? existing.displayName,
      passwordHash,
      role: patch.role ?? existing.role,
    })
    .where(eq(users.id, existing.id))
    .run();

  return getUser(existing.id);
}

export function softDeleteUser(idOrEmail: string): void {
  const existing = requireUserRecord(idOrEmail);
  if (existing.role === "owner") {
    throw new AppError("Owner user cannot be deleted", {
      statusCode: 400,
      code: "owner_delete_forbidden",
    });
  }

  getOrm()
    .update(users)
    .set({
      deletedAt: new Date().toISOString(),
    })
    .where(eq(users.id, existing.id))
    .run();
}

export function verifyUserPassword(email: string, password: string): User {
  const normalizedEmail = normalizeEmail(email);
  const existing = getOrm()
    .select()
    .from(users)
    .where(and(eq(users.email, normalizedEmail), isNull(users.deletedAt)))
    .get();

  if (
    !existing?.passwordHash ||
    !getBcrypt().compareSync(password, existing.passwordHash)
  ) {
    throw new AppError("Invalid email or password", {
      statusCode: 401,
      code: "invalid_credentials",
    });
  }

  const lastLoginAt = new Date().toISOString();
  getOrm()
    .update(users)
    .set({ lastLoginAt })
    .where(eq(users.id, existing.id))
    .run();

  return {
    ...mapUser(existing),
    lastLoginAt,
  };
}
