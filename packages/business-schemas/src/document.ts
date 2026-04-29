import { z } from "zod";

import { expenseLineItemSchema, expenseTotalsSchema, taxLineSchema } from "./expense.js";
import { payrollRawLineSchema, payrollStatusSchema } from "./payroll.js";

export const documentKindSchema = z.enum([
  "expense_invoice",
  "sales_invoice",
  "payroll",
  "contract",
  "bank_screenshot",
  "bank_statement",
  "bank_csv",
  "other",
  "expense",
  "sales-invoice",
  "expense-invoice",
]);

export const documentUploadSchema = z
  .object({
    kind: documentKindSchema,
    source: z.string().optional(),
  })
  .strict();

export type DocumentUploadInput = z.infer<typeof documentUploadSchema>;

const sharedDocumentOverrideSchema = z.object({
  invoiceNumber: z.string().min(1).optional(),
  invoiceDate: z.string().min(1).optional(),
  dueDate: z.string().min(1).optional(),
  currency: z.string().length(3).optional(),
  notes: z.string().min(1).optional(),
});

export const documentIngestOverridesSchema = sharedDocumentOverrideSchema
  .extend({
    supplierContactId: z.string().min(1).optional(),
    supplierName: z.string().min(1).optional(),
    totals: expenseTotalsSchema.optional(),
    taxLines: z.array(taxLineSchema).optional(),
    category: z.string().min(1).optional(),
    customerContactId: z.string().min(1).optional(),
    customerName: z.string().min(1).optional(),
    status: z.enum(["draft", "finalized", "paid", "cancelled"]).optional(),
    paymentTermsDays: z.number().int().positive().optional(),
    lineItems: z.array(expenseLineItemSchema).optional(),
    issueDate: z.string().min(1).optional(),
    serviceDate: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    counterpartyContactId: z.string().min(1).optional(),
    effectiveDate: z.string().min(1).optional(),
    employeeContactId: z.string().min(1).optional(),
    employeeName: z.string().min(1).optional(),
    payrollNumber: z.string().min(1).optional(),
    countryCode: z.string().length(2).optional(),
    periodStart: z.string().min(10).max(10).optional(),
    periodEnd: z.string().min(10).max(10).optional(),
    paymentDate: z.string().min(10).max(10).optional(),
    grossSalary: z.string().min(1).optional(),
    netSalary: z.string().min(1).optional(),
    employeeTaxWithheld: z.string().min(1).optional(),
    employeeSocialContributions: z.string().min(1).optional(),
    employerSocialContributions: z.string().min(1).optional(),
    otherDeductions: z.string().min(1).optional(),
    otherEarnings: z.string().min(1).optional(),
    rawLines: z.array(payrollRawLineSchema).optional(),
    payrollStatus: payrollStatusSchema.optional(),
  })
  .strict();

export const documentIngestSchema = z
  .object({
    kind: z.enum(["expense_invoice", "sales_invoice", "payroll", "contract", "bank_screenshot", "bank_statement", "bank_csv", "expense", "sales-invoice", "expense-invoice"]),
    companyCardId: z.string().min(1).optional(),
    source: z.string().optional(),
    overrides: documentIngestOverridesSchema.optional(),
    targetSalesInvoiceId: z.string().min(1).optional(),
  })
  .strict();

export type DocumentIngestInput = z.infer<typeof documentIngestSchema>;
export type DocumentIngestOverrides = z.infer<typeof documentIngestOverridesSchema>;
