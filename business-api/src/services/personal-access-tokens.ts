import { createHash, randomBytes } from "node:crypto";

import { and, asc, eq, gt, isNull, or } from "drizzle-orm";

import { getOrm } from "../db/connection.js";
import {
  personalAccessTokens,
  type PersonalAccessTokenActorType,
} from "../db/schema/index.js";
import { AppError } from "../lib/errors.js";
import { createPrefixedId } from "../lib/ids.js";
import { getUser, type User } from "./users.js";
import { getUserRecordByIdOrEmail, requireUserRecord } from "./shared.js";

export type AuthScope = "read" | "write" | "admin";

export type PersonalAccessToken = {
  tokenId: string;
  userId: string;
  name: string;
  scopes: AuthScope[];
  actorType: PersonalAccessTokenActorType;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  user?: User;
};

export type CreatedPersonalAccessToken = PersonalAccessToken & {
  plaintext: string;
};

const validScopes = new Set<AuthScope>(["read", "write", "admin"]);
const validActorTypes = new Set<PersonalAccessTokenActorType>([
  "user",
  "agent",
]);

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function createRawPersonalAccessToken(): string {
  return `wpat_${randomBytes(24).toString("base64url")}`;
}

function assertPersonalAccessTokenFormat(token: string): void {
  if (!token.startsWith("wpat_")) {
    throwInvalidPersonalAccessToken();
  }
}

function throwInvalidPersonalAccessToken(): never {
  throw new AppError("Personal access token is invalid or expired", {
    statusCode: 401,
    code: "invalid_personal_access_token",
  });
}

function parseScopes(raw: string): AuthScope[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((scope): scope is AuthScope =>
      validScopes.has(scope as AuthScope),
    );
  } catch {
    return [];
  }
}

function validateScopes(scopes: AuthScope[]): void {
  if (scopes.length === 0 || scopes.some((scope) => !validScopes.has(scope))) {
    throw new AppError("Personal access token scopes are invalid", {
      statusCode: 400,
      code: "validation_error",
    });
  }
}

function validateActorType(actorType: PersonalAccessTokenActorType): void {
  if (!validActorTypes.has(actorType)) {
    throw new AppError("Personal access token actor type is invalid", {
      statusCode: 400,
      code: "validation_error",
    });
  }
}

function mapPersonalAccessToken(
  record: typeof personalAccessTokens.$inferSelect,
): PersonalAccessToken {
  return {
    tokenId: record.id,
    userId: record.userId,
    name: record.name,
    scopes: parseScopes(record.scopes),
    actorType: record.actorType,
    expiresAt: record.expiresAt,
    lastUsedAt: record.lastUsedAt,
    revokedAt: record.revokedAt,
    createdAt: record.createdAt,
  };
}

export function createToken(
  userId: string,
  input: {
    name: string;
    scopes: AuthScope[];
    actorType: PersonalAccessTokenActorType;
    expiresAt?: string | null;
  },
): CreatedPersonalAccessToken {
  validateScopes(input.scopes);
  validateActorType(input.actorType);
  const user = requireUserRecord(userId);
  const createdAt = new Date().toISOString();
  const plaintext = createRawPersonalAccessToken();
  const record = {
    id: createPrefixedId("pat_"),
    userId: user.id,
    name: input.name,
    tokenHash: hashToken(plaintext),
    scopes: JSON.stringify(input.scopes),
    actorType: input.actorType,
    expiresAt: input.expiresAt ?? null,
    lastUsedAt: null,
    revokedAt: null,
    createdAt,
  };

  getOrm().insert(personalAccessTokens).values(record).run();

  return {
    ...mapPersonalAccessToken(record),
    plaintext,
  };
}

export function requireActiveToken(rawToken: string): PersonalAccessToken {
  assertPersonalAccessTokenFormat(rawToken);
  const now = new Date().toISOString();
  const record = getOrm()
    .select()
    .from(personalAccessTokens)
    .where(
      and(
        eq(personalAccessTokens.tokenHash, hashToken(rawToken)),
        isNull(personalAccessTokens.revokedAt),
        or(
          isNull(personalAccessTokens.expiresAt),
          gt(personalAccessTokens.expiresAt, now),
        )!,
      ),
    )
    .get();

  if (!record || !getUserRecordByIdOrEmail(record.userId)) {
    throwInvalidPersonalAccessToken();
  }

  getOrm()
    .update(personalAccessTokens)
    .set({ lastUsedAt: now })
    .where(eq(personalAccessTokens.id, record.id))
    .run();

  return {
    ...mapPersonalAccessToken({
      ...record,
      lastUsedAt: now,
    }),
    user: getUser(record.userId),
  };
}

export function listTokensForUser(userId: string): PersonalAccessToken[] {
  const user = requireUserRecord(userId);
  return getOrm()
    .select()
    .from(personalAccessTokens)
    .where(eq(personalAccessTokens.userId, user.id))
    .orderBy(asc(personalAccessTokens.createdAt), asc(personalAccessTokens.id))
    .all()
    .map(mapPersonalAccessToken);
}

export function revokeToken(tokenId: string, userId?: string): void {
  const conditions = [eq(personalAccessTokens.id, tokenId)];
  if (userId) {
    const user = requireUserRecord(userId);
    conditions.push(eq(personalAccessTokens.userId, user.id));
  }

  const existing = getOrm()
    .select()
    .from(personalAccessTokens)
    .where(and(...conditions))
    .get();

  if (!existing) {
    throw new AppError(`Personal access token not found: ${tokenId}`, {
      statusCode: 404,
      code: "not_found",
    });
  }

  getOrm()
    .update(personalAccessTokens)
    .set({
      revokedAt: new Date().toISOString(),
    })
    .where(eq(personalAccessTokens.id, existing.id))
    .run();
}
