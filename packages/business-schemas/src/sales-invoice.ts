import { z } from "zod";

export const salesInvoiceGenerateSchema = z
  .object({
    customerContactId: z.string().min(1),
    dealId: z.string().optional(),
    issueDate: z.string().min(1),
    serviceDate: z.string().optional(),
    paymentTermsDays: z.number().int().positive().default(30),
    invoiceNumberStrategy: z.enum(["next"]).default("next"),
  })
  .strict();

export const salesInvoicePatchSchema = z
  .object({
    serviceDate: z.string().optional(),
    dueDate: z.string().optional(),
    paymentTermsDays: z.number().int().positive().optional(),
    status: z.enum(["draft", "finalized", "paid", "cancelled"]).optional(),
    pdfDocumentId: z.string().optional(),
  })
  .strict();

export type SalesInvoiceGenerateInput = z.infer<typeof salesInvoiceGenerateSchema>;
export type SalesInvoicePatch = z.infer<typeof salesInvoicePatchSchema>;
