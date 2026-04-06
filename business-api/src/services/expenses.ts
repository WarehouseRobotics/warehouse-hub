import { and, eq, isNull } from "drizzle-orm";

import { getOrm } from "../db/connection.js";
import { expenses } from "../db/schema/index.js";
import { AppError } from "../lib/errors.js";
import { normalizeMoneyString } from "../lib/money.js";
import { createPrefixedId } from "../lib/ids.js";
import { createSlug } from "../lib/slug-ids.js";
import type { ExpenseInput, ExpensePatch } from "../schemas/expense.js";
import {
  requireCompanyCardRecord,
  requireContactRecord,
  requireDocumentRecord,
  requireExpenseRecord,
} from "./shared.js";

function mapExpense(record: typeof expenses.$inferSelect) {
  return {
    expenseId: record.id,
    slug: record.slug,
    supplierContactId: record.supplierContactId,
    documentId: record.documentId,
    invoiceNumber: record.invoiceNumber,
    invoiceDate: record.invoiceDate,
    dueDate: record.dueDate,
    currency: record.currency,
    totals: {
      net: record.net,
      tax: record.tax,
      gross: record.gross,
    },
    taxLines: record.taxLines ? (JSON.parse(record.taxLines) as unknown[]) : [],
    category: record.category,
    notes: record.notes,
    status: record.status,
    bookedAt: record.createdAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function normalizeExpenseInput(data: ExpenseInput | ExpensePatch, existing?: typeof expenses.$inferSelect) {
  const totals = data.totals
    ? {
        net: normalizeMoneyString(data.totals.net),
        tax: normalizeMoneyString(data.totals.tax),
        gross: normalizeMoneyString(data.totals.gross),
      }
    : existing
      ? { net: existing.net, tax: existing.tax, gross: existing.gross }
      : null;

  return {
    supplierContactId: data.supplierContactId ?? existing?.supplierContactId,
    documentId: data.documentId ?? existing?.documentId ?? null,
    invoiceNumber: data.invoiceNumber ?? existing?.invoiceNumber ?? null,
    invoiceDate: data.invoiceDate ?? existing?.invoiceDate ?? null,
    dueDate: data.dueDate ?? existing?.dueDate ?? null,
    currency: data.currency ?? existing?.currency,
    totals,
    taxLines: data.taxLines ?? (existing?.taxLines ? JSON.parse(existing.taxLines) : []),
    category: data.category ?? existing?.category ?? null,
    notes: data.notes ?? existing?.notes ?? null,
    status: data.status ?? existing?.status ?? "recorded",
  };
}

function assertExpenseTransition(fromStatus: string, toStatus: string): void {
  const allowedTransitions: Record<string, string[]> = {
    recorded: ["recorded", "paid", "void"],
    paid: ["paid"],
    void: ["void"],
  };

  if (!allowedTransitions[fromStatus]?.includes(toStatus)) {
    throw new AppError(`Invalid expense status transition: ${fromStatus} -> ${toStatus}`, {
      statusCode: 409,
      code: "invalid_status_transition",
    });
  }
}

export function createExpense(data: ExpenseInput) {
  const company = requireCompanyCardRecord();
  requireContactRecord(data.supplierContactId);
  if (data.documentId) {
    requireDocumentRecord(data.documentId);
  }

  const normalized = normalizeExpenseInput(data);
  const id = createPrefixedId("exp_");
  const now = new Date().toISOString();

  getOrm()
    .insert(expenses)
    .values({
      id,
      slug: createSlug(`${data.supplierContactId}:${data.invoiceNumber ?? id}`),
      companyCardId: company.id,
      supplierContactId: normalized.supplierContactId!,
      documentId: normalized.documentId,
      invoiceNumber: normalized.invoiceNumber,
      invoiceDate: normalized.invoiceDate,
      dueDate: normalized.dueDate,
      currency: normalized.currency!,
      net: normalized.totals!.net,
      tax: normalized.totals!.tax,
      gross: normalized.totals!.gross,
      taxLines: JSON.stringify(normalized.taxLines),
      category: normalized.category,
      notes: normalized.notes,
      status: normalized.status,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    .run();

  return getExpense(id);
}

export function listExpenses(filters: {
  supplierContactId?: string;
  category?: string;
  status?: string;
} = {}) {
  const conditions = [isNull(expenses.deletedAt)];
  if (filters.supplierContactId) {
    conditions.push(eq(expenses.supplierContactId, filters.supplierContactId));
  }
  if (filters.category) {
    conditions.push(eq(expenses.category, filters.category));
  }
  if (filters.status) {
    conditions.push(eq(expenses.status, filters.status));
  }

  return getOrm().select().from(expenses).where(and(...conditions)).all().map(mapExpense);
}

export function getExpense(idOrSlug: string) {
  return mapExpense(requireExpenseRecord(idOrSlug));
}

export function updateExpense(idOrSlug: string, patch: ExpensePatch) {
  const existing = requireExpenseRecord(idOrSlug);
  if (patch.status) {
    assertExpenseTransition(existing.status, patch.status);
  }

  if (patch.supplierContactId) {
    requireContactRecord(patch.supplierContactId);
  }
  if (patch.documentId) {
    requireDocumentRecord(patch.documentId);
  }

  const normalized = normalizeExpenseInput(patch, existing);
  getOrm()
    .update(expenses)
    .set({
      supplierContactId: normalized.supplierContactId!,
      documentId: normalized.documentId,
      invoiceNumber: normalized.invoiceNumber,
      invoiceDate: normalized.invoiceDate,
      dueDate: normalized.dueDate,
      currency: normalized.currency!,
      net: normalized.totals!.net,
      tax: normalized.totals!.tax,
      gross: normalized.totals!.gross,
      taxLines: JSON.stringify(normalized.taxLines),
      category: normalized.category,
      notes: normalized.notes,
      status: normalized.status,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(expenses.id, existing.id))
    .run();

  return getExpense(existing.id);
}

export function softDeleteExpense(idOrSlug: string) {
  const existing = requireExpenseRecord(idOrSlug);
  getOrm()
    .update(expenses)
    .set({
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(expenses.id, existing.id))
    .run();
}
