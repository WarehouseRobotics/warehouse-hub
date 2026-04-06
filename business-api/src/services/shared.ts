import { and, eq, isNull, or } from "drizzle-orm";

import { getOrm } from "../db/connection.js";
import { companyCard, contacts, deals, documents, expenses, projects, salesInvoices, tasks } from "../db/schema/index.js";
import { AppError } from "../lib/errors.js";

function notFound(message: string): never {
  throw new AppError(message, { statusCode: 404, code: "not_found" });
}

export function requireCompanyCardRecord() {
  const record = getOrm().select().from(companyCard).where(isNull(companyCard.deletedAt)).get();
  if (!record) {
    notFound("Company card has not been created yet");
  }

  return record;
}

export function getContactRecordByIdOrSlug(idOrSlug: string) {
  return getOrm()
    .select()
    .from(contacts)
    .where(and(isNull(contacts.deletedAt), or(eq(contacts.id, idOrSlug), eq(contacts.slug, idOrSlug))))
    .get();
}

export function requireContactRecord(idOrSlug: string) {
  const record = getContactRecordByIdOrSlug(idOrSlug);
  if (!record) {
    notFound(`Contact not found: ${idOrSlug}`);
  }

  return record;
}

export function getDocumentRecordByIdOrSlug(idOrSlug: string) {
  return getOrm()
    .select()
    .from(documents)
    .where(and(isNull(documents.deletedAt), or(eq(documents.id, idOrSlug), eq(documents.slug, idOrSlug))))
    .get();
}

export function requireDocumentRecord(idOrSlug: string) {
  const record = getDocumentRecordByIdOrSlug(idOrSlug);
  if (!record) {
    notFound(`Document not found: ${idOrSlug}`);
  }

  return record;
}

export function getExpenseRecordByIdOrSlug(idOrSlug: string) {
  return getOrm()
    .select()
    .from(expenses)
    .where(and(isNull(expenses.deletedAt), or(eq(expenses.id, idOrSlug), eq(expenses.slug, idOrSlug))))
    .get();
}

export function requireExpenseRecord(idOrSlug: string) {
  const record = getExpenseRecordByIdOrSlug(idOrSlug);
  if (!record) {
    notFound(`Expense not found: ${idOrSlug}`);
  }

  return record;
}

export function getDealRecordByIdOrSlug(idOrSlug: string) {
  return getOrm()
    .select()
    .from(deals)
    .where(and(isNull(deals.deletedAt), or(eq(deals.id, idOrSlug), eq(deals.slug, idOrSlug))))
    .get();
}

export function requireDealRecord(idOrSlug: string) {
  const record = getDealRecordByIdOrSlug(idOrSlug);
  if (!record) {
    notFound(`Deal not found: ${idOrSlug}`);
  }

  return record;
}

export function getSalesInvoiceRecordByIdOrSlug(idOrSlug: string) {
  return getOrm()
    .select()
    .from(salesInvoices)
    .where(
      and(
        isNull(salesInvoices.deletedAt),
        or(eq(salesInvoices.id, idOrSlug), eq(salesInvoices.slug, idOrSlug)),
      ),
    )
    .get();
}

export function requireSalesInvoiceRecord(idOrSlug: string) {
  const record = getSalesInvoiceRecordByIdOrSlug(idOrSlug);
  if (!record) {
    notFound(`Sales invoice not found: ${idOrSlug}`);
  }

  return record;
}

export function getProjectRecordByIdOrSlug(idOrSlug: string) {
  return getOrm()
    .select()
    .from(projects)
    .where(and(isNull(projects.deletedAt), or(eq(projects.id, idOrSlug), eq(projects.slug, idOrSlug))))
    .get();
}

export function requireProjectRecord(idOrSlug: string) {
  const record = getProjectRecordByIdOrSlug(idOrSlug);
  if (!record) {
    notFound(`Project not found: ${idOrSlug}`);
  }

  return record;
}

export function getTaskRecordByIdOrSlug(idOrSlug: string) {
  return getOrm()
    .select()
    .from(tasks)
    .where(and(isNull(tasks.deletedAt), or(eq(tasks.id, idOrSlug), eq(tasks.slug, idOrSlug))))
    .get();
}

export function requireTaskRecord(idOrSlug: string) {
  const record = getTaskRecordByIdOrSlug(idOrSlug);
  if (!record) {
    notFound(`Task not found: ${idOrSlug}`);
  }

  return record;
}
