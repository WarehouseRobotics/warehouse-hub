import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";

import { getOrm } from "../db/connection.js";
import { auditLog, type AuditActorType } from "../db/schema/index.js";
import { createPrefixedId } from "../lib/ids.js";

const DEFAULT_AUDIT_LOG_LIMIT = 50;
const MAX_AUDIT_LOG_LIMIT = 200;

export type AuditEntry = {
  auditEntryId: string;
  at: string;
  actorUserId: string | null;
  actorTokenId: string | null;
  actorType: AuditActorType;
  action: string;
  objectType: string;
  objectId: string;
  requestId: string;
  metadata: Record<string, unknown>;
};

export type CreateAuditLogEntryInput = {
  at?: string;
  actorUserId?: string | null;
  actorTokenId?: string | null;
  actorType: AuditActorType;
  action: string;
  objectType: string;
  objectId: string;
  requestId: string;
  metadata?: Record<string, unknown>;
};

export type AuditLogEntryFilters = {
  actorUserId?: string;
  actorTokenId?: string;
  actorType?: AuditActorType;
  action?: string;
  objectType?: string;
  objectId?: string;
  requestId?: string;
  before?: string;
  after?: string;
};

export type ListAuditLogEntriesInput = AuditLogEntryFilters & {
  limit?: number;
};

function clampLimit(limit?: number): number {
  if (limit === undefined) {
    return DEFAULT_AUDIT_LOG_LIMIT;
  }

  return Math.min(Math.max(Math.trunc(limit), 1), MAX_AUDIT_LOG_LIMIT);
}

function parseMetadata(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Audit rows are written by this service; malformed legacy rows should not break listing.
  }

  return {};
}

function mapAuditEntry(record: typeof auditLog.$inferSelect): AuditEntry {
  return {
    auditEntryId: record.id,
    at: record.at,
    actorUserId: record.actorUserId,
    actorTokenId: record.actorTokenId,
    actorType: record.actorType,
    action: record.action,
    objectType: record.objectType,
    objectId: record.objectId,
    requestId: record.requestId,
    metadata: parseMetadata(record.metadata),
  };
}

export function writeAuditLogEntry(
  input: CreateAuditLogEntryInput,
): AuditEntry {
  const at = input.at ?? new Date().toISOString();
  const record = {
    id: createPrefixedId("aud_"),
    at,
    actorUserId: input.actorUserId ?? null,
    actorTokenId: input.actorTokenId ?? null,
    actorType: input.actorType,
    action: input.action,
    objectType: input.objectType,
    objectId: input.objectId,
    requestId: input.requestId,
    metadata: JSON.stringify(input.metadata ?? {}),
  };

  getOrm().insert(auditLog).values(record).run();

  return mapAuditEntry(record);
}

export function listAuditLogEntries(
  input: ListAuditLogEntriesInput = {},
): AuditEntry[] {
  const conditions: SQL[] = [];
  if (input.actorUserId) {
    conditions.push(eq(auditLog.actorUserId, input.actorUserId));
  }
  if (input.actorTokenId) {
    conditions.push(eq(auditLog.actorTokenId, input.actorTokenId));
  }
  if (input.actorType) {
    conditions.push(eq(auditLog.actorType, input.actorType));
  }
  if (input.action) {
    conditions.push(eq(auditLog.action, input.action));
  }
  if (input.objectType) {
    conditions.push(eq(auditLog.objectType, input.objectType));
  }
  if (input.objectId) {
    conditions.push(eq(auditLog.objectId, input.objectId));
  }
  if (input.requestId) {
    conditions.push(eq(auditLog.requestId, input.requestId));
  }
  if (input.after) {
    conditions.push(gte(auditLog.at, input.after));
  }
  if (input.before) {
    conditions.push(lte(auditLog.at, input.before));
  }

  return getOrm()
    .select()
    .from(auditLog)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(auditLog.at), desc(auditLog.id))
    .limit(clampLimit(input.limit))
    .all()
    .map(mapAuditEntry);
}
