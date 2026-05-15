import { createHash, randomBytes } from "node:crypto";

import { and, eq, isNull, lte } from "drizzle-orm";

import { getOrm } from "../db/connection.js";
import {
  magicLinkTokens,
  type MagicLinkTokenPurpose,
} from "../db/schema/index.js";
import { AppError } from "../lib/errors.js";
import { createPrefixedId } from "../lib/ids.js";

const DEFAULT_MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
const validPurposes = new Set<MagicLinkTokenPurpose>([
  "login",
  "invite_accept",
]);

export type MagicLinkToken = {
  magicLinkTokenId: string;
  email: string;
  purpose: MagicLinkTokenPurpose;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
};

export type CreatedMagicLinkToken = MagicLinkToken & {
  token: string;
};

export type MagicLinkInput = {
  email: string;
  purpose: MagicLinkTokenPurpose;
  ttlMs?: number;
  expiresAt?: string;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function createRawMagicLinkToken(): string {
  return `mlt_${randomBytes(24).toString("base64url")}`;
}

function assertMagicLinkTokenFormat(token: string): void {
  if (!token.startsWith("mlt_")) {
    throwInvalidMagicLinkToken();
  }
}

function validatePurpose(purpose: MagicLinkTokenPurpose): void {
  if (!validPurposes.has(purpose)) {
    throw new AppError("Magic link token purpose is invalid", {
      statusCode: 400,
      code: "validation_error",
    });
  }
}

function throwInvalidMagicLinkToken(): never {
  throw new AppError("Magic link token is invalid or expired", {
    statusCode: 401,
    code: "invalid_magic_link_token",
  });
}

function mapMagicLinkToken(
  record: typeof magicLinkTokens.$inferSelect,
): MagicLinkToken {
  return {
    magicLinkTokenId: record.id,
    email: record.email,
    purpose: record.purpose,
    expiresAt: record.expiresAt,
    consumedAt: record.consumedAt,
    createdAt: record.createdAt,
  };
}

export function createMagicLink(input: MagicLinkInput): CreatedMagicLinkToken {
  validatePurpose(input.purpose);
  const createdAt = new Date();
  const token = createRawMagicLinkToken();
  const expiresAt =
    input.expiresAt ??
    new Date(
      createdAt.getTime() + (input.ttlMs ?? DEFAULT_MAGIC_LINK_TTL_MS),
    ).toISOString();
  const record = {
    id: createPrefixedId("mlt_"),
    email: normalizeEmail(input.email),
    tokenHash: hashToken(token),
    purpose: input.purpose,
    expiresAt,
    consumedAt: null,
    createdAt: createdAt.toISOString(),
  };

  getOrm().insert(magicLinkTokens).values(record).run();

  return {
    ...mapMagicLinkToken(record),
    token,
  };
}

export function requireActiveMagicLink(
  rawToken: string,
  purpose: MagicLinkTokenPurpose,
): MagicLinkToken {
  validatePurpose(purpose);
  assertMagicLinkTokenFormat(rawToken);

  const now = new Date().toISOString();
  const record = getOrm()
    .select()
    .from(magicLinkTokens)
    .where(
      and(
        eq(magicLinkTokens.tokenHash, hashToken(rawToken)),
        eq(magicLinkTokens.purpose, purpose),
        isNull(magicLinkTokens.consumedAt),
      ),
    )
    .get();

  if (!record || record.expiresAt <= now) {
    throwInvalidMagicLinkToken();
  }

  return mapMagicLinkToken(record);
}

export function consumeMagicLink(
  rawToken: string,
  purpose: MagicLinkTokenPurpose,
): MagicLinkToken {
  const magicLink = requireActiveMagicLink(rawToken, purpose);
  const now = new Date().toISOString();

  const result = getOrm()
    .update(magicLinkTokens)
    .set({ consumedAt: now })
    .where(
      and(
        eq(magicLinkTokens.id, magicLink.magicLinkTokenId),
        isNull(magicLinkTokens.consumedAt),
      ),
    )
    .run();

  if (result.changes !== 1) {
    throwInvalidMagicLinkToken();
  }

  return {
    ...magicLink,
    consumedAt: now,
  };
}

export function expireMagicLinks(
  options: { before?: string; purpose?: MagicLinkTokenPurpose } = {},
): number {
  if (options.purpose) {
    validatePurpose(options.purpose);
  }

  const consumedAt = new Date().toISOString();
  const conditions = [
    isNull(magicLinkTokens.consumedAt),
    lte(magicLinkTokens.expiresAt, options.before ?? consumedAt),
  ];
  if (options.purpose) {
    conditions.push(eq(magicLinkTokens.purpose, options.purpose));
  }

  const result = getOrm()
    .update(magicLinkTokens)
    .set({ consumedAt })
    .where(and(...conditions))
    .run();

  return result.changes;
}
