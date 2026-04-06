import { and, eq, isNull } from "drizzle-orm";

import { getOrm } from "../db/connection.js";
import { deals } from "../db/schema/index.js";
import { computeEmbeddingText, upsertEmbedding } from "../lib/embeddings.js";
import { computeLineItemTotals, normalizeQuantityString } from "../lib/money.js";
import { createPrefixedId } from "../lib/ids.js";
import { createSlug } from "../lib/slug-ids.js";
import type { DealInput, DealLineItem, DealPatch } from "../schemas/deal.js";
import { requireCompanyCardRecord, requireContactRecord, requireDealRecord } from "./shared.js";

function normalizeLineItems(lineItems: DealLineItem[]) {
  return lineItems.map((lineItem) => ({
    description: lineItem.description,
    quantity: normalizeQuantityString(lineItem.quantity),
    unitPrice: lineItem.unitPrice,
    taxRate: lineItem.taxRate ?? "0",
  }));
}

function mapDeal(record: typeof deals.$inferSelect) {
  return {
    dealId: record.id,
    slug: record.slug,
    customerContactId: record.customerContactId,
    title: record.title,
    stage: record.stage,
    currency: record.currency,
    expectedCloseDate: record.expectedCloseDate,
    lineItems: JSON.parse(record.lineItems) as unknown[],
    totals: {
      net: record.net,
      tax: record.tax,
      gross: record.gross,
    },
    notes: record.notes,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function createDeal(data: DealInput) {
  const company = requireCompanyCardRecord();
  requireContactRecord(data.customerContactId);
  const lineItems = normalizeLineItems(data.lineItems);
  const totals = computeLineItemTotals(lineItems);
  const id = createPrefixedId("deal_");
  const now = new Date().toISOString();

  getOrm()
    .insert(deals)
    .values({
      id,
      slug: createSlug(`${data.customerContactId}:${data.title}:${id}`),
      companyCardId: company.id,
      customerContactId: data.customerContactId,
      title: data.title,
      stage: data.stage,
      currency: data.currency,
      expectedCloseDate: data.expectedCloseDate ?? null,
      lineItems: JSON.stringify(lineItems),
      net: totals.net,
      tax: totals.tax,
      gross: totals.gross,
      notes: data.notes ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    .run();

  const created = getDeal(id);
  upsertEmbedding("deal", id, computeEmbeddingText("deal", created));
  return created;
}

export function listDeals(filters: { stage?: string; customerContactId?: string } = {}) {
  const conditions = [isNull(deals.deletedAt)];
  if (filters.stage) {
    conditions.push(eq(deals.stage, filters.stage));
  }
  if (filters.customerContactId) {
    conditions.push(eq(deals.customerContactId, filters.customerContactId));
  }

  return getOrm().select().from(deals).where(and(...conditions)).all().map(mapDeal);
}

export function getDeal(idOrSlug: string) {
  return mapDeal(requireDealRecord(idOrSlug));
}

export function updateDeal(idOrSlug: string, patch: DealPatch) {
  const existing = requireDealRecord(idOrSlug);
  if (patch.customerContactId) {
    requireContactRecord(patch.customerContactId);
  }

  const lineItems = patch.lineItems ? normalizeLineItems(patch.lineItems) : (JSON.parse(existing.lineItems) as DealLineItem[]);
  const totals = computeLineItemTotals(lineItems);

  getOrm()
    .update(deals)
    .set({
      customerContactId: patch.customerContactId ?? existing.customerContactId,
      title: patch.title ?? existing.title,
      stage: patch.stage ?? existing.stage,
      currency: patch.currency ?? existing.currency,
      expectedCloseDate: patch.expectedCloseDate ?? existing.expectedCloseDate,
      lineItems: JSON.stringify(lineItems),
      net: totals.net,
      tax: totals.tax,
      gross: totals.gross,
      notes: patch.notes ?? existing.notes,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(deals.id, existing.id))
    .run();

  const updated = getDeal(existing.id);
  upsertEmbedding("deal", existing.id, computeEmbeddingText("deal", updated));
  return updated;
}

export function softDeleteDeal(idOrSlug: string) {
  const existing = requireDealRecord(idOrSlug);
  getOrm()
    .update(deals)
    .set({
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(deals.id, existing.id))
    .run();
}
