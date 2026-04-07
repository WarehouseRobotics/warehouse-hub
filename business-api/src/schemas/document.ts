import { z } from "zod";

import { expenseTotalsSchema, taxLineSchema } from "./expense.js";

export const documentKindSchema = z.enum(["expense_invoice", "sales_invoice_pdf", "contract", "other"]);

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
    lineItems: z.array(z.record(z.string(), z.unknown())).optional(),
    issueDate: z.string().min(1).optional(),
    serviceDate: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    counterpartyContactId: z.string().min(1).optional(),
    effectiveDate: z.string().min(1).optional(),
  })
  .strict();

export const documentIngestSchema = z
  .object({
    kind: z.enum(["expense_invoice", "sales_invoice_pdf", "contract"]),
    companyCardId: z.string().min(1).optional(),
    source: z.string().optional(),
    overrides: documentIngestOverridesSchema.optional(),
    targetSalesInvoiceId: z.string().min(1).optional(),
  })
  .strict();

export type DocumentIngestInput = z.infer<typeof documentIngestSchema>;
export type DocumentIngestOverrides = z.infer<typeof documentIngestOverridesSchema>;
