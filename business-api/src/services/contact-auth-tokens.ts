import { createHash, randomBytes } from "node:crypto";

import { and, eq, gt, isNull } from "drizzle-orm";

import { getOrm } from "../db/connection.js";
import { contactAuthTokens } from "../db/schema/index.js";
import { AppError } from "../lib/errors.js";
import { createPrefixedId } from "../lib/ids.js";
import { requireContactRecord } from "./shared.js";

const DEFAULT_CONTACT_AUTH_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7;

function hashAuthToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function mapContactAuthToken(record: typeof contactAuthTokens.$inferSelect) {
  return {
    authTokenId: record.id,
    contactId: record.contactId,
    expiresAt: record.expiresAt,
    revokedAt: record.revokedAt,
    createdAt: record.createdAt,
  };
}

function getActiveContactAuthTokenRecordByRawToken(token: string) {
  const now = new Date().toISOString();

  return getOrm()
    .select()
    .from(contactAuthTokens)
    .where(
      and(
        eq(contactAuthTokens.tokenHash, hashAuthToken(token)),
        isNull(contactAuthTokens.revokedAt),
        gt(contactAuthTokens.expiresAt, now),
      ),
    )
    .get();
}

export function createContactAuthToken(contactIdOrSlug: string, options: { ttlMs?: number } = {}) {
  const contact = requireContactRecord(contactIdOrSlug);
  const createdAt = new Date();
  const ttlMs = options.ttlMs ?? DEFAULT_CONTACT_AUTH_TOKEN_TTL_MS;
  const expiresAt = new Date(createdAt.getTime() + ttlMs);
  const token = `ctok_${randomBytes(24).toString("base64url")}`;
  const id = createPrefixedId("ctauth_");

  getOrm()
    .insert(contactAuthTokens)
    .values({
      id,
      contactId: contact.id,
      tokenHash: hashAuthToken(token),
      expiresAt: expiresAt.toISOString(),
      revokedAt: null,
      createdAt: createdAt.toISOString(),
    })
    .run();

  return {
    ...mapContactAuthToken({
      id,
      contactId: contact.id,
      tokenHash: hashAuthToken(token),
      expiresAt: expiresAt.toISOString(),
      revokedAt: null,
      createdAt: createdAt.toISOString(),
    }),
    token,
  };
}

export function requireActiveContactAuthToken(token: string) {
  const record = getActiveContactAuthTokenRecordByRawToken(token);
  if (!record) {
    throw new AppError("Contact auth token is invalid or expired", {
      statusCode: 401,
      code: "invalid_contact_auth_token",
    });
  }

  return mapContactAuthToken(record);
}

export function revokeContactAuthToken(authTokenId: string) {
  const existing = getOrm()
    .select()
    .from(contactAuthTokens)
    .where(eq(contactAuthTokens.id, authTokenId))
    .get();

  if (!existing) {
    throw new AppError(`Contact auth token not found: ${authTokenId}`, {
      statusCode: 404,
      code: "not_found",
    });
  }

  getOrm()
    .update(contactAuthTokens)
    .set({
      revokedAt: new Date().toISOString(),
    })
    .where(eq(contactAuthTokens.id, authTokenId))
    .run();
}
