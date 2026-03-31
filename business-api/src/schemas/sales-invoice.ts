import { z } from "zod";

import { lineItemSchema } from "./deal.js";

export const salesInvoiceInputSchema = z
  .object({
    sellerCompanyId: z.string().min(1),
    customerContactId: z.string().min(1),
    dealId: z.string().optional(),
    issueDate: z.string().min(1),
    serviceDate: z.string().optional(),
    dueDate: z.string().optional(),
    currency: z.string().length(3),
    paymentTermsDays: z.number().int().positive().default(30),
    lineItems: z.array(lineItemSchema).min(1),
    net: z.string(),
    tax: z.string(),
    gross: z.string(),
    status: z.enum(["draft", "finalized", "paid", "cancelled"]).default("draft"),
    pdfDocumentId: z.string().optional(),
  })
  .strict();
