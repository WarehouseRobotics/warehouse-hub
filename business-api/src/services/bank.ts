import { createHash } from "node:crypto";

import { and, eq, isNull, or } from "drizzle-orm";

import { getOrm } from "../db/connection.js";
import {
  bankAccounts,
  bankBalanceSnapshots,
  bankTransactionMatches,
  bankTransactions,
  expenses,
  payrolls,
  salesInvoices,
} from "../db/schema/index.js";
import { AppError } from "../lib/errors.js";
import { createPrefixedId } from "../lib/ids.js";
import {
  compareDateDesc,
  matchesResolvedDateFilters,
  resolveListFilters,
  type ListFilters,
} from "../lib/list-filters.js";
import { normalizeMoneyString } from "../lib/money.js";
import { createSlug } from "../lib/slug-ids.js";
import {
  updateExpense,
} from "./expenses.js";
import { updatePayroll } from "./payrolls.js";
import { updateSalesInvoice } from "./sales-invoices.js";
import {
  requireBankAccountRecord,
  requireBankTransactionRecord,
  requireCompanyCardRecord,
  requireDocumentRecord,
  requireExpenseRecord,
  requirePayrollRecord,
  requireSalesInvoiceRecord,
} from "./shared.js";
import type {
  BankAccountInput,
  BankAccountPatch,
  BankBalanceSnapshotInput,
  BankTransactionInput,
  BankTransactionMatchInput,
  BankTransactionMatchPatch,
  BankTransactionPatch,
  BankTransactionUpsert,
} from "@warehouse-hub/business-schemas";

type BankTransactionRecord = typeof bankTransactions.$inferSelect;
type MatchCandidate = {
  targetType: "expense" | "sales_invoice" | "payroll";
  targetId: string;
  amount: string;
  date: string | null;
  reference: string | null;
  confidence: "medium" | "high";
  reason: string;
};

function normalizeLookupText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function createBankTransactionFingerprint(input: {
  bankAccountId: string;
  transactionDate: string;
  amount: string;
  reference?: string | null;
  description: string;
}): string {
  return createHash("sha256")
    .update(
      [
        input.bankAccountId,
        input.transactionDate,
        normalizeMoneyString(input.amount),
        normalizeLookupText(input.reference),
        normalizeLookupText(input.description),
      ].join("|"),
    )
    .digest("hex");
}

function mapBankAccount(record: typeof bankAccounts.$inferSelect) {
  return {
    bankAccountId: record.id,
    slug: record.slug,
    bankName: record.bankName,
    displayName: record.displayName,
    maskedIdentifier: record.maskedIdentifier,
    ibanMasked: record.ibanMasked,
    currency: record.currency,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function mapBankTransaction(record: BankTransactionRecord) {
  return {
    bankTransactionId: record.id,
    slug: record.slug,
    bankAccountId: record.bankAccountId,
    documentId: record.documentId,
    transactionDate: record.transactionDate,
    postedAt: record.postedAt,
    amount: record.amount,
    currency: record.currency,
    description: record.description,
    counterpartyName: record.counterpartyName,
    reference: record.reference,
    runningBalance: record.runningBalance,
    source: record.source,
    confidence: record.confidence,
    kind: record.kind,
    status: record.status,
    fingerprint: record.fingerprint,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function mapBankBalanceSnapshot(record: typeof bankBalanceSnapshots.$inferSelect) {
  return {
    bankBalanceSnapshotId: record.id,
    slug: record.slug,
    bankAccountId: record.bankAccountId,
    documentId: record.documentId,
    observedAt: record.observedAt,
    balance: record.balance,
    currency: record.currency,
    source: record.source,
    confidence: record.confidence,
    notes: record.notes,
    createdAt: record.createdAt,
  };
}

function mapBankTransactionMatch(record: typeof bankTransactionMatches.$inferSelect) {
  return {
    bankTransactionMatchId: record.id,
    slug: record.slug,
    bankTransactionId: record.bankTransactionId,
    targetType: record.targetType,
    targetId: record.targetId,
    status: record.status,
    confidence: record.confidence,
    reason: record.reason,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function requireMatchTarget(targetType: string, targetId: string) {
  if (targetType === "expense") {
    return requireExpenseRecord(targetId);
  }
  if (targetType === "sales_invoice") {
    return requireSalesInvoiceRecord(targetId);
  }
  if (targetType === "payroll") {
    return requirePayrollRecord(targetId);
  }

  throw new AppError(`Unsupported bank transaction match target: ${targetType}`, {
    statusCode: 400,
    code: "validation_error",
  });
}

function normalizeBankTransactionInput(data: BankTransactionInput | BankTransactionPatch, existing?: BankTransactionRecord) {
  return {
    transactionDate: data.transactionDate ?? existing?.transactionDate,
    postedAt: data.postedAt ?? existing?.postedAt ?? null,
    amount: data.amount ? normalizeMoneyString(data.amount) : existing?.amount,
    currency: data.currency ?? existing?.currency,
    description: data.description ?? existing?.description,
    counterpartyName: data.counterpartyName ?? existing?.counterpartyName ?? null,
    reference: data.reference ?? existing?.reference ?? null,
    runningBalance: data.runningBalance
      ? normalizeMoneyString(data.runningBalance)
      : existing?.runningBalance ?? null,
    source: data.source ?? existing?.source ?? null,
    confidence: data.confidence ?? existing?.confidence ?? "medium",
    kind: data.kind ?? existing?.kind ?? "bank_transaction",
    status: data.status ?? existing?.status ?? "recorded",
    documentId: data.documentId ?? existing?.documentId ?? null,
  };
}

export function createBankAccount(data: BankAccountInput) {
  const company = requireCompanyCardRecord();
  const id = createPrefixedId("ba_");
  const now = new Date().toISOString();

  getOrm()
    .insert(bankAccounts)
    .values({
      id,
      slug: createSlug(`${data.bankName}:${data.displayName}:${data.maskedIdentifier ?? data.ibanMasked ?? id}`),
      companyCardId: company.id,
      bankName: data.bankName,
      displayName: data.displayName,
      maskedIdentifier: data.maskedIdentifier ?? null,
      ibanMasked: data.ibanMasked ?? null,
      currency: data.currency,
      status: data.status,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    .run();

  return getBankAccount(id);
}

export function listBankAccounts(filters: { status?: string } = {}) {
  const conditions = [isNull(bankAccounts.deletedAt)];
  if (filters.status) {
    conditions.push(eq(bankAccounts.status, filters.status));
  }

  return getOrm()
    .select()
    .from(bankAccounts)
    .where(and(...conditions))
    .all()
    .map(mapBankAccount)
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
}

export function getBankAccount(idOrSlug: string) {
  return mapBankAccount(requireBankAccountRecord(idOrSlug));
}

export function updateBankAccount(idOrSlug: string, patch: BankAccountPatch) {
  const existing = requireBankAccountRecord(idOrSlug);
  getOrm()
    .update(bankAccounts)
    .set({
      bankName: patch.bankName ?? existing.bankName,
      displayName: patch.displayName ?? existing.displayName,
      maskedIdentifier: patch.maskedIdentifier ?? existing.maskedIdentifier,
      ibanMasked: patch.ibanMasked ?? existing.ibanMasked,
      currency: patch.currency ?? existing.currency,
      status: patch.status ?? existing.status,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(bankAccounts.id, existing.id))
    .run();

  return getBankAccount(existing.id);
}

export function softDeleteBankAccount(idOrSlug: string) {
  const existing = requireBankAccountRecord(idOrSlug);
  getOrm()
    .update(bankAccounts)
    .set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    .where(eq(bankAccounts.id, existing.id))
    .run();
}

export function createBankTransaction(data: BankTransactionInput) {
  const company = requireCompanyCardRecord();
  requireBankAccountRecord(data.bankAccountId);
  if (data.documentId) {
    requireDocumentRecord(data.documentId);
  }

  const normalized = normalizeBankTransactionInput(data);
  const fingerprint = createBankTransactionFingerprint({
    bankAccountId: data.bankAccountId,
    transactionDate: normalized.transactionDate!,
    amount: normalized.amount!,
    reference: normalized.reference,
    description: normalized.description!,
  });
  const id = createPrefixedId("btx_");
  const now = new Date().toISOString();

  try {
    getOrm()
      .insert(bankTransactions)
      .values({
        id,
        slug: createSlug(`${data.bankAccountId}:${normalized.transactionDate}:${normalized.amount}:${id}`),
        companyCardId: company.id,
        bankAccountId: data.bankAccountId,
        documentId: normalized.documentId,
        transactionDate: normalized.transactionDate!,
        postedAt: normalized.postedAt,
        amount: normalized.amount!,
        currency: normalized.currency!,
        description: normalized.description!,
        counterpartyName: normalized.counterpartyName,
        reference: normalized.reference,
        runningBalance: normalized.runningBalance,
        source: normalized.source,
        confidence: normalized.confidence,
        kind: normalized.kind,
        status: normalized.status,
        fingerprint,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      .run();
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
      throw new AppError("Bank transaction already exists for this account and fingerprint", {
        statusCode: 409,
        code: "duplicate_bank_transaction",
        details: { fingerprint },
      });
    }
    throw error;
  }

  return getBankTransaction(id);
}

export function upsertBankTransaction(data: BankTransactionUpsert) {
  const account = requireBankAccountRecord(data.bankAccountId);
  if (data.documentId) {
    requireDocumentRecord(data.documentId);
  }

  const normalized = normalizeBankTransactionInput(data);
  const fingerprint = data.fingerprint ?? createBankTransactionFingerprint({
    bankAccountId: data.bankAccountId,
    transactionDate: normalized.transactionDate!,
    amount: normalized.amount!,
    reference: normalized.reference,
    description: normalized.description!,
  });

  const existing = getOrm()
    .select()
    .from(bankTransactions)
    .where(and(eq(bankTransactions.bankAccountId, account.id), eq(bankTransactions.fingerprint, fingerprint)))
    .get();

  if (existing && !existing.deletedAt) {
    getOrm()
      .update(bankTransactions)
      .set({
        documentId: normalized.documentId,
        postedAt: normalized.postedAt,
        currency: normalized.currency!,
        description: normalized.description!,
        counterpartyName: normalized.counterpartyName,
        reference: normalized.reference,
        runningBalance: normalized.runningBalance,
        source: normalized.source,
        confidence: normalized.confidence,
        kind: normalized.kind,
        status: normalized.status,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(bankTransactions.id, existing.id))
      .run();

    return { action: "updated" as const, transaction: getBankTransaction(existing.id) };
  }

  return { action: "created" as const, transaction: createBankTransaction({ ...data, bankAccountId: account.id }) };
}

export async function listBankTransactions(filters: {
  bankAccountId?: string;
  status?: string;
  kind?: string;
} & ListFilters = {}) {
  const conditions = [isNull(bankTransactions.deletedAt)];
  if (filters.bankAccountId) {
    conditions.push(eq(bankTransactions.bankAccountId, filters.bankAccountId));
  }
  if (filters.status) {
    conditions.push(eq(bankTransactions.status, filters.status));
  }
  if (filters.kind) {
    conditions.push(eq(bankTransactions.kind, filters.kind));
  }

  const resolvedFilters = resolveListFilters(filters);
  return getOrm()
    .select()
    .from(bankTransactions)
    .where(and(...conditions))
    .all()
    .map(mapBankTransaction)
    .filter((transaction) => matchesResolvedDateFilters(transaction.transactionDate, resolvedFilters))
    .sort((left, right) => (
      compareDateDesc(left.transactionDate, right.transactionDate)
      || compareDateDesc(left.createdAt, right.createdAt)
      || right.bankTransactionId.localeCompare(left.bankTransactionId)
    ))
    .slice(0, resolvedFilters.limit);
}

export function getBankTransaction(idOrSlug: string) {
  return mapBankTransaction(requireBankTransactionRecord(idOrSlug));
}

export function updateBankTransaction(idOrSlug: string, patch: BankTransactionPatch) {
  const existing = requireBankTransactionRecord(idOrSlug);
  if (patch.documentId) {
    requireDocumentRecord(patch.documentId);
  }
  const normalized = normalizeBankTransactionInput(patch, existing);

  getOrm()
    .update(bankTransactions)
    .set({
      documentId: normalized.documentId,
      transactionDate: normalized.transactionDate!,
      postedAt: normalized.postedAt,
      amount: normalized.amount!,
      currency: normalized.currency!,
      description: normalized.description!,
      counterpartyName: normalized.counterpartyName,
      reference: normalized.reference,
      runningBalance: normalized.runningBalance,
      source: normalized.source,
      confidence: normalized.confidence,
      kind: normalized.kind,
      status: normalized.status,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(bankTransactions.id, existing.id))
    .run();

  return getBankTransaction(existing.id);
}

export function softDeleteBankTransaction(idOrSlug: string) {
  const existing = requireBankTransactionRecord(idOrSlug);
  getOrm()
    .update(bankTransactions)
    .set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    .where(eq(bankTransactions.id, existing.id))
    .run();
}

export function createBankBalanceSnapshot(data: BankBalanceSnapshotInput) {
  const company = requireCompanyCardRecord();
  requireBankAccountRecord(data.bankAccountId);
  if (data.documentId) {
    requireDocumentRecord(data.documentId);
  }
  const id = createPrefixedId("bbs_");
  const now = new Date().toISOString();

  getOrm()
    .insert(bankBalanceSnapshots)
    .values({
      id,
      slug: createSlug(`${data.bankAccountId}:${data.observedAt}:${data.balance}:${id}`),
      companyCardId: company.id,
      bankAccountId: data.bankAccountId,
      documentId: data.documentId ?? null,
      observedAt: data.observedAt,
      balance: normalizeMoneyString(data.balance),
      currency: data.currency,
      source: data.source ?? null,
      confidence: data.confidence,
      notes: data.notes ?? null,
      createdAt: now,
      deletedAt: null,
    })
    .run();

  return mapBankBalanceSnapshot(
    getOrm().select().from(bankBalanceSnapshots).where(eq(bankBalanceSnapshots.id, id)).get()!,
  );
}

export function listBankBalanceSnapshots(filters: { bankAccountId?: string } & ListFilters = {}) {
  const conditions = [isNull(bankBalanceSnapshots.deletedAt)];
  if (filters.bankAccountId) {
    conditions.push(eq(bankBalanceSnapshots.bankAccountId, filters.bankAccountId));
  }

  const resolvedFilters = resolveListFilters(filters);
  return getOrm()
    .select()
    .from(bankBalanceSnapshots)
    .where(and(...conditions))
    .all()
    .map(mapBankBalanceSnapshot)
    .filter((snapshot) => matchesResolvedDateFilters(snapshot.observedAt, resolvedFilters))
    .sort((left, right) => (
      compareDateDesc(left.observedAt, right.observedAt)
      || compareDateDesc(left.createdAt, right.createdAt)
      || right.bankBalanceSnapshotId.localeCompare(left.bankBalanceSnapshotId)
    ))
    .slice(0, resolvedFilters.limit);
}

function getExistingMatch(bankTransactionId: string, targetType: string, targetId: string) {
  return getOrm()
    .select()
    .from(bankTransactionMatches)
    .where(
      and(
        isNull(bankTransactionMatches.deletedAt),
        eq(bankTransactionMatches.bankTransactionId, bankTransactionId),
        eq(bankTransactionMatches.targetType, targetType),
        eq(bankTransactionMatches.targetId, targetId),
      ),
    )
    .get();
}

function applyConfirmedMatch(targetType: string, targetId: string): void {
  if (targetType === "expense") {
    const expense = requireExpenseRecord(targetId);
    if (expense.status === "recorded") {
      updateExpense(expense.id, { status: "paid" });
    }
    return;
  }

  if (targetType === "payroll") {
    const payroll = requirePayrollRecord(targetId);
    if (payroll.status === "recorded") {
      updatePayroll(payroll.id, { status: "paid" });
    }
    return;
  }

  if (targetType === "sales_invoice") {
    const invoice = requireSalesInvoiceRecord(targetId);
    if (invoice.status === "finalized") {
      updateSalesInvoice(invoice.id, { status: "paid" });
    }
    return;
  }
}

export function createBankTransactionMatch(data: BankTransactionMatchInput) {
  const transaction = requireBankTransactionRecord(data.bankTransactionId);
  const target = requireMatchTarget(data.targetType, data.targetId);
  const existing = getExistingMatch(transaction.id, data.targetType, target.id);

  if (existing) {
    return updateBankTransactionMatch(existing.id, {
      status: data.status,
      confidence: data.confidence,
      reason: data.reason,
    });
  }

  const id = createPrefixedId("btm_");
  const now = new Date().toISOString();
  getOrm()
    .insert(bankTransactionMatches)
    .values({
      id,
      slug: createSlug(`${transaction.id}:${data.targetType}:${target.id}:${id}`),
      bankTransactionId: transaction.id,
      targetType: data.targetType,
      targetId: target.id,
      status: data.status,
      confidence: data.confidence,
      reason: data.reason ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    .run();

  if (data.status === "confirmed") {
    applyConfirmedMatch(data.targetType, target.id);
  }

  return mapBankTransactionMatch(
    getOrm().select().from(bankTransactionMatches).where(eq(bankTransactionMatches.id, id)).get()!,
  );
}

export function listBankTransactionMatches(filters: { bankTransactionId?: string; status?: string } = {}) {
  const conditions = [isNull(bankTransactionMatches.deletedAt)];
  if (filters.bankTransactionId) {
    conditions.push(eq(bankTransactionMatches.bankTransactionId, filters.bankTransactionId));
  }
  if (filters.status) {
    conditions.push(eq(bankTransactionMatches.status, filters.status));
  }

  return getOrm()
    .select()
    .from(bankTransactionMatches)
    .where(and(...conditions))
    .all()
    .map(mapBankTransactionMatch);
}

export function updateBankTransactionMatch(idOrSlug: string, patch: BankTransactionMatchPatch) {
  const existing = getOrm()
    .select()
    .from(bankTransactionMatches)
    .where(
      and(
        isNull(bankTransactionMatches.deletedAt),
        or(eq(bankTransactionMatches.id, idOrSlug), eq(bankTransactionMatches.slug, idOrSlug)),
      ),
    )
    .get();
  if (!existing) {
    throw new AppError(`Bank transaction match not found: ${idOrSlug}`, { statusCode: 404, code: "not_found" });
  }

  getOrm()
    .update(bankTransactionMatches)
    .set({
      status: patch.status ?? existing.status,
      confidence: patch.confidence ?? existing.confidence,
      reason: patch.reason ?? existing.reason,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(bankTransactionMatches.id, existing.id))
    .run();

  const updated = getOrm()
    .select()
    .from(bankTransactionMatches)
    .where(eq(bankTransactionMatches.id, existing.id))
    .get()!;

  if (updated.status === "confirmed" && existing.status !== "confirmed") {
    applyConfirmedMatch(updated.targetType, updated.targetId);
  }

  return mapBankTransactionMatch(updated);
}

function isWithinDays(left: string | null, right: string, days: number): boolean {
  if (!left) {
    return false;
  }
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) {
    return false;
  }

  return Math.abs(leftTime - rightTime) <= days * 24 * 60 * 60 * 1000;
}

function pushCandidate(
  candidates: MatchCandidate[],
  candidate: Omit<MatchCandidate, "confidence" | "reason">,
  transaction: BankTransactionRecord,
): void {
  const amountMatches = normalizeMoneyString(candidate.amount) === transaction.amount;
  if (!amountMatches) {
    return;
  }

  const transactionText = normalizeLookupText(`${transaction.reference ?? ""} ${transaction.description}`);
  const reference = normalizeLookupText(candidate.reference);
  const referenceMatches = Boolean(reference && transactionText.includes(reference));
  const dateMatches = isWithinDays(candidate.date, transaction.transactionDate, 7);
  if (!referenceMatches && !dateMatches) {
    return;
  }

  candidates.push({
    ...candidate,
    confidence: referenceMatches ? "high" : "medium",
    reason: referenceMatches
      ? "Amount and reference matched"
      : "Amount matched within the transaction date window",
  });
}

function computeMatchCandidates(transaction: BankTransactionRecord): MatchCandidate[] {
  const candidates: MatchCandidate[] = [];

  if (transaction.amount.startsWith("-")) {
    for (const expense of getOrm().select().from(expenses).where(and(isNull(expenses.deletedAt), eq(expenses.status, "recorded"))).all()) {
      pushCandidate(
        candidates,
        {
          targetType: "expense",
          targetId: expense.id,
          amount: `-${expense.gross}`,
          date: expense.invoiceDate,
          reference: expense.invoiceNumber,
        },
        transaction,
      );
    }

    for (const payroll of getOrm().select().from(payrolls).where(and(isNull(payrolls.deletedAt), eq(payrolls.status, "recorded"))).all()) {
      pushCandidate(
        candidates,
        {
          targetType: "payroll",
          targetId: payroll.id,
          amount: `-${payroll.netSalary}`,
          date: payroll.paymentDate ?? payroll.periodEnd,
          reference: payroll.payrollNumber,
        },
        transaction,
      );
    }
  } else {
    for (const invoice of getOrm().select().from(salesInvoices).where(and(isNull(salesInvoices.deletedAt), eq(salesInvoices.status, "finalized"))).all()) {
      pushCandidate(
        candidates,
        {
          targetType: "sales_invoice",
          targetId: invoice.id,
          amount: invoice.gross,
          date: invoice.dueDate ?? invoice.issueDate,
          reference: invoice.invoiceNumber,
        },
        transaction,
      );
    }
  }

  return candidates;
}

export function matchBankTransaction(idOrSlug: string) {
  const transaction = requireBankTransactionRecord(idOrSlug);
  const candidates = computeMatchCandidates(transaction);
  const highConfidence = candidates.filter((candidate) => candidate.confidence === "high");
  const shouldAutoConfirm = highConfidence.length === 1 && candidates.length === 1;

  const matches = candidates.map((candidate) =>
    createBankTransactionMatch({
      bankTransactionId: transaction.id,
      targetType: candidate.targetType,
      targetId: candidate.targetId,
      status: shouldAutoConfirm ? "confirmed" : "suggested",
      confidence: candidate.confidence,
      reason: candidate.reason,
    }),
  );

  return {
    bankTransactionId: transaction.id,
    autoConfirmed: shouldAutoConfirm,
    matches,
  };
}

export type BankCsvRowInput = {
  transactionDate: string;
  amount: string;
  description: string;
  reference?: string;
  runningBalance?: string;
  currency: string;
};

export function importBankTransactionsFromRows(
  bankAccountId: string,
  rows: BankCsvRowInput[],
  options: { source: string; documentId?: string },
) {
  requireBankAccountRecord(bankAccountId);
  if (options.documentId) {
    requireDocumentRecord(options.documentId);
  }

  const results = rows.map((row) =>
    upsertBankTransaction({
      bankAccountId,
      transactionDate: row.transactionDate,
      amount: row.amount,
      currency: row.currency,
      description: row.description,
      reference: row.reference,
      runningBalance: row.runningBalance,
      source: options.source,
      confidence: "high",
      kind: "bank_transaction",
      status: "recorded",
      documentId: options.documentId,
    }),
  );

  return {
    created: results.filter((result) => result.action === "created").length,
    updated: results.filter((result) => result.action === "updated").length,
    needsReview: results.filter((result) => result.transaction.status === "needs_review").length,
    transactions: results.map((result) => result.transaction),
  };
}
