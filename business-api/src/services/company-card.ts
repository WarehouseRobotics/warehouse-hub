import { eq, isNull } from "drizzle-orm";

import { getOrm } from "../db/connection.js";
import { companyCard } from "../db/schema/index.js";
import { computeEmbeddingText, isBenignEmbeddingSyncError, upsertEmbedding } from "../lib/embeddings.js";
import { createPrefixedId } from "../lib/ids.js";
import { logger } from "../lib/logger.js";
import { createSlug } from "../lib/slug-ids.js";
import type { CompanyCardInput } from "@warehouse-hub/business-schemas";
import { ensureDefaultTasksProject } from "./projects.js";

function mapCompanyCard(record: typeof companyCard.$inferSelect) {
  return {
    companyId: record.id,
    slug: record.slug,
    legalName: record.legalName,
    displayName: record.displayName,
    taxId: record.taxId,
    vatId: record.vatId,
    email: record.email,
    phone: record.phone,
    website: record.website,
    address: {
      street1: record.addressStreet1,
      street2: record.addressStreet2,
      city: record.addressCity,
      postalCode: record.addressPostalCode,
      countryCode: record.addressCountryCode,
    },
    invoiceDefaults: {
      currency: record.currency,
      paymentTermsDays: record.paymentTermsDays,
      vatMode: record.vatMode,
    },
    bankDetails: {
      ibanMasked: record.bankIbanMasked,
      bic: record.bankBic,
    },
    updatedAt: record.updatedAt,
  };
}

function scheduleEmbedding(companyId: string, payload: ReturnType<typeof mapCompanyCard>): void {
  void upsertEmbedding("company_card", companyId, computeEmbeddingText("company_card", payload)).catch((error) => {
    if (isBenignEmbeddingSyncError(error)) {
      return;
    }
    logger.warn("Failed to sync company-card embedding", { companyId, error });
  });
}

export function getCompanyCard() {
  const row = getOrm().select().from(companyCard).where(isNull(companyCard.deletedAt)).get();
  return row ? mapCompanyCard(row) : null;
}

export function upsertCompanyCard(data: CompanyCardInput) {
  const db = getOrm();
  const existing = db.select().from(companyCard).where(isNull(companyCard.deletedAt)).get();
  const now = new Date().toISOString();

  if (existing) {
    db.update(companyCard)
      .set({
        legalName: data.legalName,
        displayName: data.displayName,
        taxId: data.taxId ?? null,
        vatId: data.vatId ?? null,
        email: data.email ?? null,
        phone: data.phone ?? null,
        website: data.website ?? null,
        addressStreet1: data.address.street1,
        addressStreet2: data.address.street2 ?? null,
        addressCity: data.address.city,
        addressPostalCode: data.address.postalCode,
        addressCountryCode: data.address.countryCode,
        currency: data.invoiceDefaults.currency,
        paymentTermsDays: data.invoiceDefaults.paymentTermsDays,
        vatMode: data.invoiceDefaults.vatMode,
        bankIbanMasked: data.bankDetails?.ibanMasked ?? null,
        bankBic: data.bankDetails?.bic ?? null,
        updatedAt: now,
      })
      .where(eq(companyCard.id, existing.id))
      .run();

    const updated = db.select().from(companyCard).where(eq(companyCard.id, existing.id)).get();
    const mapped = mapCompanyCard(updated!);
    scheduleEmbedding(existing.id, mapped);
    return mapped;
  }

  const id = createPrefixedId("comp_");
  db.insert(companyCard)
    .values({
      id,
      slug: createSlug(`${data.legalName}:${data.taxId ?? id}`),
      legalName: data.legalName,
      displayName: data.displayName,
      taxId: data.taxId ?? null,
      vatId: data.vatId ?? null,
      email: data.email ?? null,
      phone: data.phone ?? null,
      website: data.website ?? null,
      addressStreet1: data.address.street1,
      addressStreet2: data.address.street2 ?? null,
      addressCity: data.address.city,
      addressPostalCode: data.address.postalCode,
      addressCountryCode: data.address.countryCode,
      currency: data.invoiceDefaults.currency,
      paymentTermsDays: data.invoiceDefaults.paymentTermsDays,
      vatMode: data.invoiceDefaults.vatMode,
      bankIbanMasked: data.bankDetails?.ibanMasked ?? null,
      bankBic: data.bankDetails?.bic ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    .run();

  ensureDefaultTasksProject(id);
  const created = db.select().from(companyCard).where(eq(companyCard.id, id)).get();
  const mapped = mapCompanyCard(created!);
  scheduleEmbedding(id, mapped);
  return mapped;
}
