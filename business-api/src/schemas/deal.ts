import { z } from "zod";

export const lineItemSchema = z
  .object({
    description: z.string().min(1),
    quantity: z.number().positive(),
    unitPrice: z.string(),
    taxRate: z.string().optional(),
  })
  .strict();

export const dealInputSchema = z
  .object({
    companyCardId: z.string().min(1),
    customerContactId: z.string().min(1),
    title: z.string().min(1),
    stage: z.string().min(1),
    currency: z.string().length(3),
    expectedCloseDate: z.string().optional(),
    lineItems: z.array(lineItemSchema).min(1),
    net: z.string(),
    tax: z.string(),
    gross: z.string(),
    notes: z.string().optional(),
  })
  .strict();
