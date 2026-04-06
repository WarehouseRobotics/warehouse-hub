import { and, eq, isNull, like, or } from "drizzle-orm";

import { getOrm } from "../db/connection.js";
import { contacts } from "../db/schema/index.js";
import { computeEmbeddingText, isBenignEmbeddingSyncError, upsertEmbedding } from "../lib/embeddings.js";
import { AppError } from "../lib/errors.js";
import { createPrefixedId } from "../lib/ids.js";
import { createSlug } from "../lib/slug-ids.js";
import type { ContactInput, ContactPatch, ContactResolveInput, ContactType } from "../schemas/contact.js";
import { requireContactRecord } from "./shared.js";

function parseRoles(raw: string): string[] {
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
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

function getContactRecordByIdOrSlug(idOrSlug: string) {
  return getOrm()
    .select()
    .from(contacts)
    .where(and(isNull(contacts.deletedAt), or(eq(contacts.id, idOrSlug), eq(contacts.slug, idOrSlug))))
    .get();
}

function scheduleEmbedding(contactId: string, payload: ReturnType<typeof getContact>): void {
  void upsertEmbedding("contact", contactId, computeEmbeddingText("contact", payload)).catch((error) => {
    if (isBenignEmbeddingSyncError(error)) {
      return;
    }
    console.warn(`Failed to sync contact embedding for ${contactId}:`, error);
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
  const existing = getContactRecordByIdOrSlug(idOrSlug);
  if (!existing) {
    throw new AppError(`Contact not found: ${idOrSlug}`, { statusCode: 404, code: "not_found" });
  }

  const now = new Date().toISOString();
  getOrm()
    .update(contacts)
    .set({
      parentContactId: patch.parentContactId ?? existing.parentContactId,
      type: patch.type ?? existing.type,
      roles: patch.roles ? JSON.stringify(patch.roles) : existing.roles,
      displayName: patch.displayName ?? existing.displayName,
      legalName: patch.legalName ?? existing.legalName,
      taxId: patch.taxId ?? existing.taxId,
      email: patch.email ?? existing.email,
      phone: patch.phone ?? existing.phone,
      billingAddressStreet1: patch.billingAddress?.street1 ?? existing.billingAddressStreet1,
      billingAddressStreet2: patch.billingAddress?.street2 ?? existing.billingAddressStreet2,
      billingAddressCity: patch.billingAddress?.city ?? existing.billingAddressCity,
      billingAddressPostalCode:
        patch.billingAddress?.postalCode ?? existing.billingAddressPostalCode,
      billingAddressCountryCode:
        patch.billingAddress?.countryCode ?? existing.billingAddressCountryCode,
      notes: patch.notes ?? existing.notes,
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
  const existing = getContactRecordByIdOrSlug(idOrSlug);
  if (!existing) {
    throw new AppError(`Contact not found: ${idOrSlug}`, { statusCode: 404, code: "not_found" });
  }

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
    taxId: input.contact.taxId?.trim().toLowerCase(),
    email: input.contact.email?.trim().toLowerCase(),
    legalName: input.contact.legalName?.trim().toLowerCase(),
  };

  for (const matcher of matchers) {
    const matched = candidates.find((candidate) => {
      if (matcher === "taxId") {
        return normalizedTarget.taxId && candidate.taxId?.trim().toLowerCase() === normalizedTarget.taxId;
      }

      if (matcher === "email") {
        return normalizedTarget.email && candidate.email?.trim().toLowerCase() === normalizedTarget.email;
      }

      return (
        normalizedTarget.legalName &&
        candidate.legalName?.trim().toLowerCase() === normalizedTarget.legalName
      );
    });

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
