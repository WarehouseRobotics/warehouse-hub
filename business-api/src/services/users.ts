import { and, asc, eq, isNull } from "drizzle-orm";

import { getOrm } from "../db/connection.js";
import { users, type UserRole } from "../db/schema/index.js";
import { AppError } from "../lib/errors.js";
import { createPrefixedId } from "../lib/ids.js";
import { comparePassword, hashPassword } from "../lib/passwords.js";
import { getWorkspace } from "./workspaces.js";
import { requireUserRecord } from "./shared.js";

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

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
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

function isSqliteUniqueConstraintError(error: unknown): error is Error {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes("UNIQUE constraint failed") ||
    String((error as { code?: string }).code).includes(
      "SQLITE_CONSTRAINT_UNIQUE",
    )
  );
}

function getActiveUserByEmail(workspaceId: string, email: string) {
  return getOrm()
    .select()
    .from(users)
    .where(
      and(
        eq(users.workspaceId, workspaceId),
        eq(users.email, email),
        isNull(users.deletedAt),
      ),
    )
    .get();
}

function getActiveOwner(workspaceId: string) {
  return getOrm()
    .select()
    .from(users)
    .where(
      and(
        eq(users.workspaceId, workspaceId),
        eq(users.role, "owner"),
        isNull(users.deletedAt),
      ),
    )
    .get();
}

function throwUserAlreadyExists(email: string): never {
  throw new AppError(`User already exists: ${email}`, {
    statusCode: 409,
    code: "conflict",
  });
}

function throwOwnerAlreadyExists(workspaceId: string): never {
  throw new AppError("Workspace already has an active owner", {
    statusCode: 409,
    code: "owner_conflict",
    details: { workspaceId },
  });
}

function assertCanCreateUser(input: {
  workspaceId: string;
  email: string;
  role: UserRole;
}): void {
  if (getActiveUserByEmail(input.workspaceId, input.email)) {
    throwUserAlreadyExists(input.email);
  }

  if (input.role === "owner" && getActiveOwner(input.workspaceId)) {
    throwOwnerAlreadyExists(input.workspaceId);
  }
}

function translateUserConstraintError(
  error: unknown,
  input: {
    workspaceId: string;
    email: string;
    role: UserRole;
  },
): never {
  if (!isSqliteUniqueConstraintError(error)) {
    throw error;
  }

  if (getActiveUserByEmail(input.workspaceId, input.email)) {
    throwUserAlreadyExists(input.email);
  }

  if (input.role === "owner" && getActiveOwner(input.workspaceId)) {
    throwOwnerAlreadyExists(input.workspaceId);
  }

  throw new AppError("User violates an active uniqueness constraint", {
    statusCode: 409,
    code: "conflict",
  });
}

export function createUser(input: UserInput): User {
  const now = new Date().toISOString();
  const id = createPrefixedId("usr_");
  const workspaceId = input.workspaceId ?? getWorkspace().id;
  const email = normalizeEmail(input.email);

  assertCanCreateUser({ workspaceId, email, role: input.role });

  try {
    getOrm()
      .insert(users)
      .values({
        id,
        workspaceId,
        email,
        displayName: input.displayName,
        passwordHash: mapPasswordHash(input.password),
        role: input.role,
        createdAt: now,
        lastLoginAt: null,
        deletedAt: null,
      })
      .run();
  } catch (error) {
    translateUserConstraintError(error, {
      workspaceId,
      email,
      role: input.role,
    });
  }

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
  const role = patch.role ?? existing.role;
  if (existing.role === "owner" && role !== "owner") {
    throw new AppError("Owner user role cannot be changed", {
      statusCode: 400,
      code: "owner_role_change_forbidden",
    });
  }
  if (
    existing.role !== "owner" &&
    role === "owner" &&
    getActiveOwner(existing.workspaceId)
  ) {
    throwOwnerAlreadyExists(existing.workspaceId);
  }

  const passwordHash =
    patch.password === undefined
      ? existing.passwordHash
      : mapPasswordHash(patch.password);

  try {
    getOrm()
      .update(users)
      .set({
        displayName: patch.displayName ?? existing.displayName,
        passwordHash,
        role,
      })
      .where(eq(users.id, existing.id))
      .run();
  } catch (error) {
    translateUserConstraintError(error, {
      workspaceId: existing.workspaceId,
      email: existing.email,
      role,
    });
  }

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
    !comparePassword(password, existing.passwordHash)
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
