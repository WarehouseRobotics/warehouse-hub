import { z } from "zod";

export const documentKindSchema = z.enum(["expense_invoice", "sales_invoice_pdf", "contract", "other"]);

export const documentUploadSchema = z
  .object({
    kind: documentKindSchema,
    source: z.string().optional(),
  })
  .strict();

export type DocumentUploadInput = z.infer<typeof documentUploadSchema>;
