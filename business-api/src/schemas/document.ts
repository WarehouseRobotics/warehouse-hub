import { z } from "zod";

export const documentInputSchema = z
  .object({
    kind: z.enum(["expense_invoice", "sales_invoice_pdf", "contract", "other"]),
    source: z.string().optional(),
    originalFilename: z.string().min(1),
    mimeType: z.string().min(1),
    filePath: z.string().min(1),
    checksum: z.string().optional(),
  })
  .strict();
