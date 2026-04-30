import { and, eq, isNull, like, or } from "drizzle-orm";

import { getOrm } from "../db/connection.js";
import { contacts } from "../db/schema/index.js";
import { computeEmbeddingText, isBenignEmbeddingSyncError, upsertEmbedding } from "../lib/embeddings.js";
import { AppError } from "../lib/errors.js";
import { createPrefixedId } from "../lib/ids.js";
import { logger } from "../lib/logger.js";
import { createSlug } from "../lib/slug-ids.js";
import type {
  ContactInput,
  ContactNotificationPreferences,
  ContactPatch,
  ContactResolveInput,
  ContactType,
} from "@warehouse-hub/business-schemas";
import { getContactRecordByIdOrSlug, requireContactRecord } from "./shared.js";

const LEGAL_SUFFIXES = [
  "llc",
  "ltd",
  "inc",
  "corp",
  "co",
  "sl",
  "sa",
  "gmbh",
  "bv",
  "oy",
  "sas",
  "sarl",
];

function parseRoles(raw: string): string[] {
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

function parseNotificationPreferences(raw: string | null): ContactNotificationPreferences | null {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as ContactNotificationPreferences;
  } catch {
    return null;
  }
}

function mapNotificationPreferences(value: ContactNotificationPreferences | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  return JSON.stringify(value);
}

function mergeValue<T>(patchValue: T | undefined, existingValue: T): T {
  return patchValue !== undefined ? patchValue : existingValue;
}

function mapContact(record: typeof contacts.$inferSelect) {
  return {
    contactId: record.id,
    slug: record.slug,
    parentContactId: record.parentContactId,
    type: record.type,
    roles: parseRoles(record.roles),
    displayName: record.displayName,
    legalName: record.legalName,
    taxId: record.taxId,
    email: record.email,
    phone: record.phone,
    slackUserId: record.slackUserId,
    discordUserId: record.discordUserId,
    whatsappUserId: record.whatsappUserId,
    telegramUserId: record.telegramUserId,
    notificationPreferences: parseNotificationPreferences(record.notificationPreferences),
    billingAddress: {
      street1: record.billingAddressStreet1,
      street2: record.billingAddressStreet2,
      city: record.billingAddressCity,
      postalCode: record.billingAddressPostalCode,
      countryCode: record.billingAddressCountryCode,
    },
    notes: record.notes,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function scheduleEmbedding(contactId: string, payload: ReturnType<typeof getContact>): void {
  void upsertEmbedding("contact", contactId, computeEmbeddingText("contact", payload)).catch((error) => {
    if (isBenignEmbeddingSyncError(error)) {
      return;
    }
    logger.warn("Failed to sync contact embedding", { contactId, error });
  });
}

function validateParentContact(parentContactId: string | undefined, type: ContactType): void {
  if (!parentContactId) {
    return;
  }

  const parent = requireContactRecord(parentContactId);
  if (type !== "person") {
    throw new AppError("Only person contacts can be nested under a parent contact", {
      statusCode: 400,
      code: "invalid_parent_contact",
    });
  }

  if (parent.type !== "company") {
    throw new AppError("Parent contact must be a company", {
      statusCode: 400,
      code: "invalid_parent_contact",
    });
  }
}

function normalizeValue(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized || undefined;
}

function canonicalizeCompanyName(value: string | undefined): string | undefined {
  const normalized = normalizeValue(value)
    ?.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, " ")
    .replace(/\b(s\s*l|s\s*a)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return undefined;
  }

  const tokens = normalized
    .split(" ")
    .filter(Boolean)
    .filter((token) => !LEGAL_SUFFIXES.includes(token));

  return tokens.join(" ").trim() || undefined;
}

export function createContact(data: ContactInput) {
  validateParentContact(data.parentContactId, data.type);
  const now = new Date().toISOString();
  const id = createPrefixedId("ct_");
  const slug = createSlug(`${data.displayName}:${data.email ?? data.taxId ?? id}`);

  getOrm()
    .insert(contacts)
    .values({
      id,
      slug,
      parentContactId: data.parentContactId ?? null,
      type: data.type,
      roles: JSON.stringify(data.roles),
      displayName: data.displayName,
      legalName: data.legalName ?? null,
      taxId: data.taxId ?? null,
      email: data.email ?? null,
      phone: data.phone ?? null,
      slackUserId: data.slackUserId ?? null,
      discordUserId: data.discordUserId ?? null,
      whatsappUserId: data.whatsappUserId ?? null,
      telegramUserId: data.telegramUserId ?? null,
      notificationPreferences: mapNotificationPreferences(data.notificationPreferences),
      billingAddressStreet1: data.billingAddress?.street1 ?? null,
      billingAddressStreet2: data.billingAddress?.street2 ?? null,
      billingAddressCity: data.billingAddress?.city ?? null,
      billingAddressPostalCode: data.billingAddress?.postalCode ?? null,
      billingAddressCountryCode: data.billingAddress?.countryCode ?? null,
      notes: data.notes ?? null,
      status: data.status,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    .run();

  const created = getContact(id);
  scheduleEmbedding(id, created);
  return created;
}

export function listContacts(filters: {
  query?: string;
  role?: string;
  type?: ContactType;
  parentContactId?: string;
} = {}) {
  const conditions = [isNull(contacts.deletedAt)];

  if (filters.type) {
    conditions.push(eq(contacts.type, filters.type));
  }

  if (filters.parentContactId) {
    conditions.push(eq(contacts.parentContactId, filters.parentContactId));
  }

  if (filters.query) {
    const pattern = `%${filters.query}%`;
    conditions.push(
      or(
        like(contacts.displayName, pattern),
        like(contacts.legalName, pattern),
        like(contacts.email, pattern),
        like(contacts.notes, pattern),
      )!,
    );
  }

  const records = getOrm()
    .select()
    .from(contacts)
    .where(and(...conditions))
    .all();

  return records
    .filter((record) => !filters.role || parseRoles(record.roles).includes(filters.role))
    .map(mapContact);
}

export function getContact(idOrSlug: string) {
  const row = getContactRecordByIdOrSlug(idOrSlug);
  if (!row) {
    throw new AppError(`Contact not found: ${idOrSlug}`, { statusCode: 404, code: "not_found" });
  }

  const children = row.type === "company"
    ? getOrm()
        .select()
        .from(contacts)
        .where(and(eq(contacts.parentContactId, row.id), isNull(contacts.deletedAt)))
        .all()
        .map(mapContact)
    : [];

  return {
    ...mapContact(row),
    persons: children,
  };
}

export function updateContact(idOrSlug: string, patch: ContactPatch) {
  const existing = requireContactRecord(idOrSlug);

  const nextType = patch.type ?? existing.type;
  const nextParentContactId = mergeValue(patch.parentContactId, existing.parentContactId);
  validateParentContact(nextParentContactId ?? undefined, nextType);

  const now = new Date().toISOString();
  getOrm()
    .update(contacts)
    .set({
      parentContactId: nextParentContactId,
      type: nextType,
      roles: patch.roles ? JSON.stringify(patch.roles) : existing.roles,
      displayName: patch.displayName ?? existing.displayName,
      legalName: mergeValue(patch.legalName, existing.legalName),
      taxId: mergeValue(patch.taxId, existing.taxId),
      email: mergeValue(patch.email, existing.email),
      phone: mergeValue(patch.phone, existing.phone),
      slackUserId: mergeValue(patch.slackUserId, existing.slackUserId),
      discordUserId: mergeValue(patch.discordUserId, existing.discordUserId),
      whatsappUserId: mergeValue(patch.whatsappUserId, existing.whatsappUserId),
      telegramUserId: mergeValue(patch.telegramUserId, existing.telegramUserId),
      notificationPreferences:
        patch.notificationPreferences !== undefined
          ? mapNotificationPreferences(patch.notificationPreferences)
          : existing.notificationPreferences,
      billingAddressStreet1:
        patch.billingAddress !== undefined
          ? patch.billingAddress?.street1 ?? null
          : existing.billingAddressStreet1,
      billingAddressStreet2:
        patch.billingAddress !== undefined
          ? patch.billingAddress?.street2 ?? null
          : existing.billingAddressStreet2,
      billingAddressCity:
        patch.billingAddress !== undefined
          ? patch.billingAddress?.city ?? null
          : existing.billingAddressCity,
      billingAddressPostalCode:
        patch.billingAddress !== undefined
          ? patch.billingAddress?.postalCode ?? null
          : existing.billingAddressPostalCode,
      billingAddressCountryCode:
        patch.billingAddress !== undefined
          ? patch.billingAddress?.countryCode ?? null
          : existing.billingAddressCountryCode,
      notes: mergeValue(patch.notes, existing.notes),
      status: patch.status ?? existing.status,
      updatedAt: now,
    })
    .where(eq(contacts.id, existing.id))
    .run();

  const updated = getContact(existing.id);
  scheduleEmbedding(existing.id, updated);
  return updated;
}

export function softDeleteContact(idOrSlug: string) {
  const existing = requireContactRecord(idOrSlug);

  getOrm()
    .update(contacts)
    .set({
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(contacts.id, existing.id))
    .run();
}

export function resolveContact(input: ContactResolveInput) {
  const matchers = input.matchBy;
  const candidates = getOrm().select().from(contacts).where(isNull(contacts.deletedAt)).all();
  const normalizedTarget = {
    taxId: normalizeValue(input.contact.taxId),
    email: normalizeValue(input.contact.email),
    legalName: normalizeValue(input.contact.legalName),
    canonicalName: canonicalizeCompanyName(input.contact.legalName ?? input.contact.displayName),
  };

  for (const matcher of matchers) {
    const matchedCandidates = candidates.filter((candidate) => {
      if (matcher === "taxId") {
        return !!normalizedTarget.taxId && normalizeValue(candidate.taxId ?? undefined) === normalizedTarget.taxId;
      }

      if (matcher === "email") {
        return !!normalizedTarget.email && normalizeValue(candidate.email ?? undefined) === normalizedTarget.email;
      }

      if (matcher === "canonicalName") {
        return (
          normalizedTarget.canonicalName &&
          normalizedTarget.canonicalName === canonicalizeCompanyName(candidate.legalName ?? candidate.displayName)
        );
      }

      return (
        !!normalizedTarget.legalName &&
        normalizeValue(candidate.legalName ?? undefined) === normalizedTarget.legalName
      );
    });

    if (matcher === "canonicalName" && matchedCandidates.length > 1) {
      throw new AppError(`Error: Contact resolution is ambiguous, there's more than one record matching query: ${normalizedTarget.canonicalName}. Candidates: ${matchedCandidates.map((candidate) => candidate.legalName || candidate.displayName || candidate.taxId || candidate.email).join(", ")}`, {
        statusCode: 422,
        code: "contact_resolution_ambiguous",
        details: {
          matchedContactIds: matchedCandidates.map((candidate) => candidate.id),
          canonicalName: normalizedTarget.canonicalName,
        },
      });
    }

    const matched = matchedCandidates[0];
    if (matched) {
      return {
        contactId: matched.id,
        resolution: "matched" as const,
        matchedBy: matcher,
      };
    }
  }

  if (!input.autoCreate) {
    throw new AppError("Contact could not be resolved", {
      statusCode: 404,
      code: "not_found",
    });
  }

  const created = createContact(input.contact);
  return {
    contactId: created.contactId,
    resolution: "created" as const,
    matchedBy: null,
  };
}
