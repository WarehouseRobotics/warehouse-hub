import { z } from "zod";

export const lineItemSchema = z
  .object({
    description: z.string().min(1),
    quantity: z.union([z.string(), z.number()]),
    unitPrice: z.string(),
    taxRate: z.string().optional(),
  })
  .strict();

export const dealInputSchema = z
  .object({
    customerContactId: z.string().min(1),
    title: z.string().min(1),
    stage: z.string().min(1),
    currency: z.string().length(3),
    expectedCloseDate: z.string().optional(),
    lineItems: z.array(lineItemSchema).min(1),
    notes: z.string().optional(),
  })
  .strict();

export const dealPatchSchema = dealInputSchema.partial();

export type DealInput = z.infer<typeof dealInputSchema>;
export type DealPatch = z.infer<typeof dealPatchSchema>;
export type DealLineItem = z.infer<typeof lineItemSchema>;
