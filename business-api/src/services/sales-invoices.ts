import { and, eq, isNull } from "drizzle-orm";

import { getOrm } from "../db/connection.js";
import { contacts, invoiceNumberSeq, salesInvoices } from "../db/schema/index.js";
import { computeEmbeddingText, isBenignEmbeddingSyncError, upsertEmbedding } from "../lib/embeddings.js";
import { AppError } from "../lib/errors.js";
import { createPrefixedId } from "../lib/ids.js";
import { applySimilarityFilter, matchesResolvedDateFilters, resolveListFilters, type ListFilters } from "../lib/list-filters.js";
import { logger } from "../lib/logger.js";
import { normalizeMoneyString } from "../lib/money.js";
import { createSlug } from "../lib/slug-ids.js";
import type { SalesInvoiceGenerateInput, SalesInvoicePatch } from "@warehouse-hub/business-schemas";
import {
  requireCompanyCardRecord,
  requireContactRecord,
  requireDealRecord,
  requireDocumentRecord,
  requireSalesInvoiceRecord,
} from "./shared.js";

function mapSalesInvoice(record: typeof salesInvoices.$inferSelect) {
  const customer = getOrm().select().from(contacts).where(eq(contacts.id, record.customerContactId)).get();

  return {
    salesInvoiceId: record.id,
    slug: record.slug,
    invoiceNumber: record.invoiceNumber,
    status: record.status,
    sellerCompanyId: record.companyCardId,
    customerContactId: record.customerContactId,
    dealId: record.dealId,
    issueDate: record.issueDate,
    serviceDate: record.serviceDate,
    dueDate: record.dueDate,
    currency: record.currency,
    paymentTermsDays: record.paymentTermsDays,
    lineItems: JSON.parse(record.lineItems) as unknown[],
    customerDisplayName: customer?.displayName ?? null,
    customerLegalName: customer?.legalName ?? null,
    customerEmail: customer?.email ?? null,
    totals: {
      net: record.net,
      tax: record.tax,
      gross: record.gross,
    },
    pdfDocumentId: record.pdfDocumentId,
    pdfStatus: record.pdfDocumentId ? "available" : "pending",
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function scheduleEmbedding(invoiceId: string, payload: ReturnType<typeof getSalesInvoice>): void {
  void upsertEmbedding("sales_invoice", invoiceId, computeEmbeddingText("sales_invoice", payload)).catch((error) => {
    if (isBenignEmbeddingSyncError(error)) {
      return;
    }
    logger.warn("Failed to sync sales-invoice embedding", { invoiceId, error });
  });
}

function addDays(date: string, days: number): string {
  const value = new Date(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function normalizeSalesInvoiceTotals(
  totals: { net: string; tax: string; gross: string },
): { net: string; tax: string; gross: string } {
  return {
    net: normalizeMoneyString(totals.net),
    tax: normalizeMoneyString(totals.tax),
    gross: normalizeMoneyString(totals.gross),
  };
}

function getSalesInvoiceRecordByInvoiceNumber(invoiceNumber: string) {
  return getOrm()
    .select()
    .from(salesInvoices)
    .where(and(isNull(salesInvoices.deletedAt), eq(salesInvoices.invoiceNumber, invoiceNumber)))
    .get();
}

function nextInvoiceNumber(issueDate: string): string {
  const year = Number.parseInt(issueDate.slice(0, 4), 10);
  const existing = getOrm().select().from(invoiceNumberSeq).where(eq(invoiceNumberSeq.year, year)).get();
  const nextNumber = (existing?.lastNumber ?? 0) + 1;

  if (existing) {
    getOrm()
      .update(invoiceNumberSeq)
      .set({ lastNumber: nextNumber })
      .where(eq(invoiceNumberSeq.year, year))
      .run();
  } else {
    getOrm().insert(invoiceNumberSeq).values({ year, lastNumber: nextNumber }).run();
  }

  return `${year}-${String(nextNumber).padStart(4, "0")}`;
}

function assertInvoiceTransition(fromStatus: string, toStatus: string): void {
  const allowedTransitions: Record<string, string[]> = {
    draft: ["draft", "finalized", "cancelled"],
    finalized: ["finalized", "paid", "cancelled"],
    paid: ["paid"],
    cancelled: ["cancelled"],
  };

  if (!allowedTransitions[fromStatus]?.includes(toStatus)) {
    throw new AppError(`Invalid sales invoice status transition: ${fromStatus} -> ${toStatus}`, {
      statusCode: 409,
      code: "invalid_status_transition",
    });
  }
}

export function generateSalesInvoice(data: SalesInvoiceGenerateInput) {
  const company = requireCompanyCardRecord();
  const customer = requireContactRecord(data.customerContactId);
  const deal = data.dealId ? requireDealRecord(data.dealId) : null;
  const paymentTermsDays = data.paymentTermsDays ?? company.paymentTermsDays;
  const dueDate = addDays(data.issueDate, paymentTermsDays);
  const lineItems = deal ? JSON.parse(deal.lineItems) : [];
  const invoiceNumber = nextInvoiceNumber(data.issueDate);
  const id = createPrefixedId("sinv_");
  const now = new Date().toISOString();

  getOrm()
    .insert(salesInvoices)
    .values({
      id,
      slug: createSlug(`${data.customerContactId}:${invoiceNumber}:${id}`),
      invoiceNumber,
      companyCardId: company.id,
      customerContactId: customer.id,
      dealId: deal?.id ?? null,
      issueDate: data.issueDate,
      serviceDate: data.serviceDate ?? null,
      dueDate,
      currency: deal?.currency ?? company.currency,
      paymentTermsDays,
      lineItems: JSON.stringify(lineItems),
      net: deal?.net ?? "0.00",
      tax: deal?.tax ?? "0.00",
      gross: deal?.gross ?? "0.00",
      status: "draft",
      pdfDocumentId: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    .run();

  const created = getSalesInvoice(id);
  scheduleEmbedding(id, created);
  return created;
}

export async function listSalesInvoices(filters: { status?: string; customerContactId?: string } & ListFilters = {}) {
  const conditions = [isNull(salesInvoices.deletedAt)];
  if (filters.status) {
    conditions.push(eq(salesInvoices.status, filters.status));
  }
  if (filters.customerContactId) {
    conditions.push(eq(salesInvoices.customerContactId, filters.customerContactId));
  }

  const resolvedFilters = resolveListFilters(filters);
  const items = getOrm()
    .select()
    .from(salesInvoices)
    .where(and(...conditions))
    .all()
    .map(mapSalesInvoice)
    .filter((invoice) => matchesResolvedDateFilters(invoice.issueDate, resolvedFilters));

  return applySimilarityFilter(items, {
    entityType: "sales_invoice",
    similar: resolvedFilters.similar,
    limit: resolvedFilters.limit,
    getEntityId: (invoice) => invoice.salesInvoiceId,
  });
}

export function getSalesInvoice(idOrSlug: string) {
  return mapSalesInvoice(requireSalesInvoiceRecord(idOrSlug));
}

type ImportSalesInvoiceInput = {
  targetSalesInvoiceId?: string;
  customerContactId: string;
  invoiceNumber: string;
  issueDate: string;
  serviceDate?: string;
  dueDate?: string;
  currency: string;
  paymentTermsDays?: number;
  lineItems?: unknown[];
  totals: {
    net: string;
    tax: string;
    gross: string;
  };
  status?: "draft" | "finalized" | "paid" | "cancelled";
  pdfDocumentId?: string;
  overrideFields?: string[];
};

export function importSalesInvoice(data: ImportSalesInvoiceInput) {
  const company = requireCompanyCardRecord();
  requireContactRecord(data.customerContactId);
  if (data.pdfDocumentId) {
    requireDocumentRecord(data.pdfDocumentId);
  }

  const totals = normalizeSalesInvoiceTotals(data.totals);
  const overrideFields = new Set(data.overrideFields ?? []);
  const existing = data.targetSalesInvoiceId
    ? requireSalesInvoiceRecord(data.targetSalesInvoiceId)
    : getSalesInvoiceRecordByInvoiceNumber(data.invoiceNumber);
  const now = new Date().toISOString();

  if (existing) {
    const nextStatus = overrideFields.has("status") ? data.status ?? existing.status : existing.status;
    if (overrideFields.has("status")) {
      assertInvoiceTransition(existing.status, nextStatus);
    }

    getOrm()
      .update(salesInvoices)
      .set({
        invoiceNumber: overrideFields.has("invoiceNumber") ? data.invoiceNumber : existing.invoiceNumber,
        customerContactId: overrideFields.has("customerContactId")
          ? data.customerContactId
          : existing.customerContactId,
        issueDate: overrideFields.has("issueDate") ? data.issueDate : existing.issueDate,
        serviceDate:
          overrideFields.has("serviceDate")
            ? (data.serviceDate ?? null)
            : (existing.serviceDate ?? data.serviceDate ?? null),
        dueDate:
          overrideFields.has("dueDate")
            ? (data.dueDate ?? null)
            : (existing.dueDate ?? data.dueDate ?? null),
        currency: overrideFields.has("currency") ? data.currency : existing.currency,
        paymentTermsDays: overrideFields.has("paymentTermsDays")
          ? (data.paymentTermsDays ?? existing.paymentTermsDays)
          : (existing.paymentTermsDays ?? data.paymentTermsDays ?? company.paymentTermsDays),
        lineItems: overrideFields.has("lineItems")
          ? JSON.stringify(data.lineItems ?? [])
          : existing.lineItems,
        net: overrideFields.has("totals") ? totals.net : existing.net,
        tax: overrideFields.has("totals") ? totals.tax : existing.tax,
        gross: overrideFields.has("totals") ? totals.gross : existing.gross,
        status: nextStatus,
        pdfDocumentId: data.pdfDocumentId ?? existing.pdfDocumentId,
        updatedAt: now,
      })
      .where(eq(salesInvoices.id, existing.id))
      .run();

    const updated = getSalesInvoice(existing.id);
    scheduleEmbedding(existing.id, updated);
    return updated;
  }

  const id = createPrefixedId("sinv_");
  const paymentTermsDays = data.paymentTermsDays ?? company.paymentTermsDays;

  getOrm()
    .insert(salesInvoices)
    .values({
      id,
      slug: createSlug(`${data.customerContactId}:${data.invoiceNumber}:${id}`),
      invoiceNumber: data.invoiceNumber,
      companyCardId: company.id,
      customerContactId: data.customerContactId,
      dealId: null,
      issueDate: data.issueDate,
      serviceDate: data.serviceDate ?? null,
      dueDate: data.dueDate ?? addDays(data.issueDate, paymentTermsDays),
      currency: data.currency,
      paymentTermsDays,
      lineItems: JSON.stringify(data.lineItems ?? []),
      net: totals.net,
      tax: totals.tax,
      gross: totals.gross,
      status: data.status ?? "draft",
      pdfDocumentId: data.pdfDocumentId ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    .run();

  const created = getSalesInvoice(id);
  scheduleEmbedding(id, created);
  return created;
}

export function updateSalesInvoice(idOrSlug: string, patch: SalesInvoicePatch) {
  const existing = requireSalesInvoiceRecord(idOrSlug);
  if (patch.status) {
    assertInvoiceTransition(existing.status, patch.status);
  }
  if (patch.pdfDocumentId) {
    requireDocumentRecord(patch.pdfDocumentId);
  }

  getOrm()
    .update(salesInvoices)
    .set({
      serviceDate: patch.serviceDate ?? existing.serviceDate,
      dueDate: patch.dueDate ?? existing.dueDate,
      paymentTermsDays: patch.paymentTermsDays ?? existing.paymentTermsDays,
      status: patch.status ?? existing.status,
      pdfDocumentId: patch.pdfDocumentId ?? existing.pdfDocumentId,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(salesInvoices.id, existing.id))
    .run();

  const updated = getSalesInvoice(existing.id);
  scheduleEmbedding(existing.id, updated);
  return updated;
}

export function softDeleteSalesInvoice(idOrSlug: string) {
  const existing = requireSalesInvoiceRecord(idOrSlug);
  getOrm()
    .update(salesInvoices)
    .set({
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(salesInvoices.id, existing.id))
    .run();
}
