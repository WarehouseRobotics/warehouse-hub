import { createHash, randomBytes } from "node:crypto";

import { and, eq, gt, isNull } from "drizzle-orm";

import { config } from "../config.js";
import { getOrm } from "../db/connection.js";
import { userSessions } from "../db/schema/index.js";
import { AppError } from "../lib/errors.js";
import { createPrefixedId } from "../lib/ids.js";
import { getUser, type User } from "./users.js";
import { getUserRecordByIdOrEmail, requireUserRecord } from "./shared.js";

export type UserSession = {
  sessionId: string;
  userId: string;
  expiresAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  userAgent: string | null;
  user?: User;
};

export type CreatedUserSession = UserSession & {
  sessionToken: string;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function createRawSessionToken(): string {
  return `sess_${randomBytes(24).toString("base64url")}`;
}

function assertSessionTokenFormat(token: string): void {
  if (!token.startsWith("sess_")) {
    throwInvalidSession();
  }
}

function addTtlDays(date: Date, ttlDays: number): Date {
  return new Date(date.getTime() + ttlDays * 24 * 60 * 60 * 1000);
}

function throwInvalidSession(): never {
  throw new AppError("Session is invalid or expired", {
    statusCode: 401,
    code: "invalid_session",
  });
}

function mapSession(record: typeof userSessions.$inferSelect): UserSession {
  return {
    sessionId: record.id,
    userId: record.userId,
    expiresAt: record.expiresAt,
    lastUsedAt: record.lastUsedAt,
    revokedAt: record.revokedAt,
    createdAt: record.createdAt,
    userAgent: record.userAgent,
  };
}

export function createSession(
  userId: string,
  options: { ttlDays?: number; userAgent?: string | null } = {},
): CreatedUserSession {
  const user = requireUserRecord(userId);
  const createdAt = new Date();
  const expiresAt = addTtlDays(
    createdAt,
    options.ttlDays ?? config.SESSION_TTL_DAYS,
  );
  const sessionToken = createRawSessionToken();
  const record = {
    id: createPrefixedId("sess_"),
    userId: user.id,
    tokenHash: hashToken(sessionToken),
    expiresAt: expiresAt.toISOString(),
    lastUsedAt: null,
    revokedAt: null,
    createdAt: createdAt.toISOString(),
    userAgent: options.userAgent ?? null,
  };

  getOrm().insert(userSessions).values(record).run();

  return {
    ...mapSession(record),
    sessionToken,
  };
}

export function requireActiveSession(rawToken: string): UserSession {
  assertSessionTokenFormat(rawToken);
  const now = new Date();
  const record = getOrm()
    .select()
    .from(userSessions)
    .where(
      and(
        eq(userSessions.tokenHash, hashToken(rawToken)),
        isNull(userSessions.revokedAt),
        gt(userSessions.expiresAt, now.toISOString()),
      ),
    )
    .get();

  if (!record || !getUserRecordByIdOrEmail(record.userId)) {
    throwInvalidSession();
  }

  const lastUsedAt = now.toISOString();
  const expiresAt = addTtlDays(now, config.SESSION_TTL_DAYS).toISOString();
  getOrm()
    .update(userSessions)
    .set({ lastUsedAt, expiresAt })
    .where(eq(userSessions.id, record.id))
    .run();

  return {
    ...mapSession({
      ...record,
      lastUsedAt,
      expiresAt,
    }),
    user: getUser(record.userId),
  };
}

export function revokeSession(sessionId: string): void {
  const existing = getOrm()
    .select()
    .from(userSessions)
    .where(eq(userSessions.id, sessionId))
    .get();
  if (!existing) {
    throw new AppError(`Session not found: ${sessionId}`, {
      statusCode: 404,
      code: "not_found",
    });
  }

  getOrm()
    .update(userSessions)
    .set({
      revokedAt: new Date().toISOString(),
    })
    .where(eq(userSessions.id, existing.id))
    .run();
}

export function revokeAllSessionsForUser(userId: string): void {
  const user = requireUserRecord(userId);
  getOrm()
    .update(userSessions)
    .set({
      revokedAt: new Date().toISOString(),
    })
    .where(eq(userSessions.userId, user.id))
    .run();
}
