import { and, eq, isNull, or } from "drizzle-orm";

import { getOrm } from "../db/connection.js";
import { contacts, payrolls } from "../db/schema/index.js";
import { computeEmbeddingText, isBenignEmbeddingSyncError, upsertEmbedding } from "../lib/embeddings.js";
import { AppError } from "../lib/errors.js";
import { createPrefixedId } from "../lib/ids.js";
import {
  applySimilarityFilter,
  compareDateDesc,
  matchesResolvedDateFilters,
  resolveListFilters,
  type ListFilters,
} from "../lib/list-filters.js";
import { logger } from "../lib/logger.js";
import { normalizeMoneyString } from "../lib/money.js";
import { createSlug } from "../lib/slug-ids.js";
import type { PayrollInput, PayrollPatch, PayrollRawLine } from "@warehouse-hub/business-schemas";
import {
  requireCompanyCardRecord,
  requireContactRecord,
  requireDocumentRecord,
  requirePayrollRecord,
} from "./shared.js";

function mapPayroll(record: typeof payrolls.$inferSelect) {
  const employee = getOrm().select().from(contacts).where(eq(contacts.id, record.employeeContactId)).get();

  return {
    payrollId: record.id,
    slug: record.slug,
    employeeContactId: record.employeeContactId,
    employeeDisplayName: employee?.displayName ?? null,
    employeeLegalName: employee?.legalName ?? null,
    employeeEmail: employee?.email ?? null,
    documentId: record.documentId,
    payrollNumber: record.payrollNumber,
    countryCode: record.countryCode,
    periodStart: record.periodStart,
    periodEnd: record.periodEnd,
    paymentDate: record.paymentDate,
    currency: record.currency,
    grossSalary: record.grossSalary,
    netSalary: record.netSalary,
    employeeTaxWithheld: record.employeeTaxWithheld,
    employeeSocialContributions: record.employeeSocialContributions,
    employerSocialContributions: record.employerSocialContributions,
    otherDeductions: record.otherDeductions,
    otherEarnings: record.otherEarnings,
    rawLines: JSON.parse(record.rawLines) as PayrollRawLine[],
    notes: record.notes,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function scheduleEmbedding(payrollId: string, payload: ReturnType<typeof getPayroll>): void {
  void upsertEmbedding("payroll", payrollId, computeEmbeddingText("payroll", payload)).catch((error) => {
    if (isBenignEmbeddingSyncError(error)) {
      return;
    }
    logger.warn("Failed to sync payroll embedding", { payrollId, error });
  });
}

function normalizePayrollInput(data: PayrollInput | PayrollPatch, existing?: typeof payrolls.$inferSelect) {
  return {
    employeeContactId: data.employeeContactId ?? existing?.employeeContactId,
    documentId: data.documentId ?? existing?.documentId ?? null,
    payrollNumber: data.payrollNumber ?? existing?.payrollNumber ?? null,
    countryCode: data.countryCode ?? existing?.countryCode ?? null,
    periodStart: data.periodStart ?? existing?.periodStart,
    periodEnd: data.periodEnd ?? existing?.periodEnd,
    paymentDate: data.paymentDate ?? existing?.paymentDate ?? null,
    currency: data.currency ?? existing?.currency,
    grossSalary: data.grossSalary ? normalizeMoneyString(data.grossSalary) : existing?.grossSalary,
    netSalary: data.netSalary ? normalizeMoneyString(data.netSalary) : existing?.netSalary,
    employeeTaxWithheld: data.employeeTaxWithheld
      ? normalizeMoneyString(data.employeeTaxWithheld)
      : (existing?.employeeTaxWithheld ?? "0.00"),
    employeeSocialContributions: data.employeeSocialContributions
      ? normalizeMoneyString(data.employeeSocialContributions)
      : (existing?.employeeSocialContributions ?? "0.00"),
    employerSocialContributions: data.employerSocialContributions
      ? normalizeMoneyString(data.employerSocialContributions)
      : (existing?.employerSocialContributions ?? "0.00"),
    otherDeductions: data.otherDeductions
      ? normalizeMoneyString(data.otherDeductions)
      : (existing?.otherDeductions ?? "0.00"),
    otherEarnings: data.otherEarnings
      ? normalizeMoneyString(data.otherEarnings)
      : (existing?.otherEarnings ?? "0.00"),
    rawLines: data.rawLines ?? (existing?.rawLines ? (JSON.parse(existing.rawLines) as PayrollRawLine[]) : []),
    notes: data.notes ?? existing?.notes ?? null,
    status: data.status ?? existing?.status ?? "recorded",
  };
}

function assertPayrollTransition(fromStatus: string, toStatus: string): void {
  const allowedTransitions: Record<string, string[]> = {
    recorded: ["recorded", "paid", "void"],
    paid: ["paid"],
    void: ["void"],
  };

  if (!allowedTransitions[fromStatus]?.includes(toStatus)) {
    throw new AppError(`Invalid payroll status transition: ${fromStatus} -> ${toStatus}`, {
      statusCode: 409,
      code: "invalid_status_transition",
    });
  }
}

export function findPayrollForImport(identity: {
  employeeContactId: string;
  periodStart: string;
  periodEnd: string;
  payrollNumber?: string;
  paymentDate?: string;
}) {
  const matches = getOrm()
    .select()
    .from(payrolls)
    .where(
      and(
        isNull(payrolls.deletedAt),
        eq(payrolls.employeeContactId, identity.employeeContactId),
        eq(payrolls.periodStart, identity.periodStart),
        eq(payrolls.periodEnd, identity.periodEnd),
      ),
    )
    .all();

  if (identity.payrollNumber) {
    return matches.filter((record) => record.payrollNumber === identity.payrollNumber);
  }

  if (identity.paymentDate) {
    return matches.filter((record) => record.paymentDate === identity.paymentDate);
  }

  return [];
}

export function createPayroll(data: PayrollInput) {
  const company = requireCompanyCardRecord();
  const employee = requireContactRecord(data.employeeContactId);
  if (employee.type !== "person") {
    throw new AppError("Payroll employeeContactId must reference a person contact", {
      statusCode: 400,
      code: "invalid_employee_contact",
    });
  }
  if (data.documentId) {
    requireDocumentRecord(data.documentId);
  }

  const normalized = normalizePayrollInput(data);
  const id = createPrefixedId("pay_");
  const now = new Date().toISOString();

  getOrm()
    .insert(payrolls)
    .values({
      id,
      slug: createSlug(`${data.employeeContactId}:${data.periodStart}:${data.payrollNumber ?? data.paymentDate ?? id}`),
      companyCardId: company.id,
      employeeContactId: normalized.employeeContactId!,
      documentId: normalized.documentId,
      payrollNumber: normalized.payrollNumber,
      countryCode: normalized.countryCode,
      periodStart: normalized.periodStart!,
      periodEnd: normalized.periodEnd!,
      paymentDate: normalized.paymentDate,
      currency: normalized.currency!,
      grossSalary: normalized.grossSalary!,
      netSalary: normalized.netSalary!,
      employeeTaxWithheld: normalized.employeeTaxWithheld,
      employeeSocialContributions: normalized.employeeSocialContributions,
      employerSocialContributions: normalized.employerSocialContributions,
      otherDeductions: normalized.otherDeductions,
      otherEarnings: normalized.otherEarnings,
      rawLines: JSON.stringify(normalized.rawLines),
      notes: normalized.notes,
      status: normalized.status,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    .run();

  const created = getPayroll(id);
  scheduleEmbedding(id, created);
  return created;
}

export async function listPayrolls(filters: {
  employeeContactId?: string;
  status?: string;
  countryCode?: string;
} & ListFilters = {}) {
  const conditions = [isNull(payrolls.deletedAt)];
  if (filters.employeeContactId) {
    conditions.push(eq(payrolls.employeeContactId, filters.employeeContactId));
  }
  if (filters.status) {
    conditions.push(eq(payrolls.status, filters.status));
  }
  if (filters.countryCode) {
    conditions.push(eq(payrolls.countryCode, filters.countryCode));
  }

  const resolvedFilters = resolveListFilters(filters);
  const items = getOrm()
    .select()
    .from(payrolls)
    .where(and(...conditions))
    .all()
    .map(mapPayroll)
    .filter((payroll) => matchesResolvedDateFilters(payroll.periodEnd, resolvedFilters))
    .sort((left, right) => {
      return (
        compareDateDesc(left.paymentDate, right.paymentDate)
        || compareDateDesc(left.periodEnd, right.periodEnd)
        || compareDateDesc(left.createdAt, right.createdAt)
        || right.payrollId.localeCompare(left.payrollId)
      );
    });

  return applySimilarityFilter(items, {
    entityType: "payroll",
    similar: resolvedFilters.similar,
    limit: resolvedFilters.limit,
    getEntityId: (payroll) => payroll.payrollId,
  });
}

export function getPayroll(idOrSlug: string) {
  return mapPayroll(requirePayrollRecord(idOrSlug));
}

export function updatePayroll(idOrSlug: string, patch: PayrollPatch) {
  const existing = requirePayrollRecord(idOrSlug);
  if (patch.status) {
    assertPayrollTransition(existing.status, patch.status);
  }
  if (patch.employeeContactId) {
    const employee = requireContactRecord(patch.employeeContactId);
    if (employee.type !== "person") {
      throw new AppError("Payroll employeeContactId must reference a person contact", {
        statusCode: 400,
        code: "invalid_employee_contact",
      });
    }
  }
  if (patch.documentId) {
    requireDocumentRecord(patch.documentId);
  }

  const normalized = normalizePayrollInput(patch, existing);
  getOrm()
    .update(payrolls)
    .set({
      employeeContactId: normalized.employeeContactId!,
      documentId: normalized.documentId,
      payrollNumber: normalized.payrollNumber,
      countryCode: normalized.countryCode,
      periodStart: normalized.periodStart!,
      periodEnd: normalized.periodEnd!,
      paymentDate: normalized.paymentDate,
      currency: normalized.currency!,
      grossSalary: normalized.grossSalary!,
      netSalary: normalized.netSalary!,
      employeeTaxWithheld: normalized.employeeTaxWithheld,
      employeeSocialContributions: normalized.employeeSocialContributions,
      employerSocialContributions: normalized.employerSocialContributions,
      otherDeductions: normalized.otherDeductions,
      otherEarnings: normalized.otherEarnings,
      rawLines: JSON.stringify(normalized.rawLines),
      notes: normalized.notes,
      status: normalized.status,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(payrolls.id, existing.id))
    .run();

  const updated = getPayroll(existing.id);
  scheduleEmbedding(existing.id, updated);
  return updated;
}

export function softDeletePayroll(idOrSlug: string) {
  const existing = requirePayrollRecord(idOrSlug);
  getOrm()
    .update(payrolls)
    .set({
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(payrolls.id, existing.id))
    .run();
}
