import { and, eq, isNull, or } from "drizzle-orm";

import { getOrm } from "../db/connection.js";
import {
  bankAccounts,
  bankTransactions,
  bookings,
  companyCard,
  contacts,
  deals,
  documents,
  expenses,
  payrolls,
  projects,
  salesInvoices,
  tasks,
} from "../db/schema/index.js";
import { AppError } from "../lib/errors.js";
import type { CommentableType } from "@warehouse-hub/business-schemas";

function notFound(message: string): never {
  throw new AppError(message, { statusCode: 404, code: "not_found" });
}

export function getCompanyCardRecordByIdOrSlug(idOrSlug?: string) {
  const conditions = [isNull(companyCard.deletedAt)];
  if (idOrSlug) {
    conditions.push(or(eq(companyCard.id, idOrSlug), eq(companyCard.slug, idOrSlug))!);
  }

  return getOrm().select().from(companyCard).where(and(...conditions)).get();
}

export function requireCompanyCardRecord(idOrSlug?: string) {
  const record = getCompanyCardRecordByIdOrSlug(idOrSlug);
  if (!record) {
    notFound(idOrSlug ? `Company card not found: ${idOrSlug}` : "Company card has not been created yet");
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

export function getBankAccountRecordByIdOrSlug(idOrSlug: string) {
  return getOrm()
    .select()
    .from(bankAccounts)
    .where(and(isNull(bankAccounts.deletedAt), or(eq(bankAccounts.id, idOrSlug), eq(bankAccounts.slug, idOrSlug))))
    .get();
}

export function requireBankAccountRecord(idOrSlug: string) {
  const record = getBankAccountRecordByIdOrSlug(idOrSlug);
  if (!record) {
    notFound(`Bank account not found: ${idOrSlug}`);
  }

  return record;
}

export function getBankTransactionRecordByIdOrSlug(idOrSlug: string) {
  return getOrm()
    .select()
    .from(bankTransactions)
    .where(
      and(isNull(bankTransactions.deletedAt), or(eq(bankTransactions.id, idOrSlug), eq(bankTransactions.slug, idOrSlug))),
    )
    .get();
}

export function requireBankTransactionRecord(idOrSlug: string) {
  const record = getBankTransactionRecordByIdOrSlug(idOrSlug);
  if (!record) {
    notFound(`Bank transaction not found: ${idOrSlug}`);
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

export function getPayrollRecordByIdOrSlug(idOrSlug: string) {
  return getOrm()
    .select()
    .from(payrolls)
    .where(and(isNull(payrolls.deletedAt), or(eq(payrolls.id, idOrSlug), eq(payrolls.slug, idOrSlug))))
    .get();
}

export function requirePayrollRecord(idOrSlug: string) {
  const record = getPayrollRecordByIdOrSlug(idOrSlug);
  if (!record) {
    notFound(`Payroll not found: ${idOrSlug}`);
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

export function getBookingRecordByIdOrSlug(idOrSlug: string) {
  return getOrm()
    .select()
    .from(bookings)
    .where(and(isNull(bookings.deletedAt), or(eq(bookings.id, idOrSlug), eq(bookings.slug, idOrSlug))))
    .get();
}

export function requireBookingRecord(idOrSlug: string) {
  const record = getBookingRecordByIdOrSlug(idOrSlug);
  if (!record) {
    notFound(`Booking not found: ${idOrSlug}`);
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

export function resolveCommentableRecord(type: CommentableType, idOrSlug: string): { id: string; slug: string } {
  switch (type) {
    case "company_card": {
      const record = requireCompanyCardRecord(idOrSlug);
      return { id: record.id, slug: record.slug };
    }
    case "contact": {
      const record = requireContactRecord(idOrSlug);
      return { id: record.id, slug: record.slug };
    }
    case "document": {
      const record = requireDocumentRecord(idOrSlug);
      return { id: record.id, slug: record.slug };
    }
    case "expense": {
      const record = requireExpenseRecord(idOrSlug);
      return { id: record.id, slug: record.slug };
    }
    case "payroll": {
      const record = requirePayrollRecord(idOrSlug);
      return { id: record.id, slug: record.slug };
    }
    case "deal": {
      const record = requireDealRecord(idOrSlug);
      return { id: record.id, slug: record.slug };
    }
    case "booking": {
      const record = requireBookingRecord(idOrSlug);
      return { id: record.id, slug: record.slug };
    }
    case "sales_invoice": {
      const record = requireSalesInvoiceRecord(idOrSlug);
      return { id: record.id, slug: record.slug };
    }
    case "project": {
      const record = requireProjectRecord(idOrSlug);
      return { id: record.id, slug: record.slug };
    }
    case "task": {
      const record = requireTaskRecord(idOrSlug);
      return { id: record.id, slug: record.slug };
    }
    default:
      throw new AppError(`Unsupported commentable type: ${String(type)}`, {
        statusCode: 400,
        code: "validation_error",
      });
  }
}
