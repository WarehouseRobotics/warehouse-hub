import { z } from "zod";

export const taxLineSchema = z
  .object({
    rate: z.string(),
    net: z.string(),
    tax: z.string(),
  })
  .strict();

export const expenseInputSchema = z
  .object({
    companyCardId: z.string().min(1),
    supplierContactId: z.string().min(1),
    documentId: z.string().optional(),
    invoiceNumber: z.string().optional(),
    invoiceDate: z.string().optional(),
    dueDate: z.string().optional(),
    currency: z.string().length(3),
    net: z.string(),
    tax: z.string(),
    gross: z.string(),
    taxLines: z.array(taxLineSchema).optional(),
    category: z.string().optional(),
    notes: z.string().optional(),
    status: z.enum(["recorded", "paid", "void"]).default("recorded"),
  })
  .strict();
