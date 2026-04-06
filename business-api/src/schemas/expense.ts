import { z } from "zod";

export const taxLineSchema = z
  .object({
    name: z.string().optional(),
    rate: z.string(),
    base: z.string(),
    amount: z.string(),
  })
  .strict();

export const expenseTotalsSchema = z
  .object({
    net: z.string(),
    tax: z.string(),
    gross: z.string(),
  })
  .strict();

export const expenseInputSchema = z
  .object({
    supplierContactId: z.string().min(1),
    documentId: z.string().optional(),
    invoiceNumber: z.string().optional(),
    invoiceDate: z.string().optional(),
    dueDate: z.string().optional(),
    currency: z.string().length(3),
    totals: expenseTotalsSchema,
    taxLines: z.array(taxLineSchema).optional(),
    category: z.string().optional(),
    notes: z.string().optional(),
    status: z.enum(["recorded", "paid", "void"]).default("recorded"),
  })
  .strict();

export const expensePatchSchema = expenseInputSchema.partial();

export type ExpenseInput = z.infer<typeof expenseInputSchema>;
export type ExpensePatch = z.infer<typeof expensePatchSchema>;
