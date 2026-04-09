import { z } from "zod";
export const addressSchema = z
    .object({
    street1: z.string().min(1),
    street2: z.string().optional(),
    city: z.string().min(1),
    postalCode: z.string().min(1),
    countryCode: z.string().length(2),
})
    .strict();
export const companyCardInputSchema = z
    .object({
    legalName: z.string().min(1),
    displayName: z.string().min(1),
    taxId: z.string().optional(),
    vatId: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    website: z.string().url().optional(),
    address: addressSchema,
    invoiceDefaults: z
        .object({
        currency: z.string().length(3),
        paymentTermsDays: z.number().int().positive().default(30),
        vatMode: z.string().default("standard"),
    })
        .strict(),
    bankDetails: z
        .object({
        ibanMasked: z.string().optional(),
        bic: z.string().optional(),
    })
        .strict()
        .optional(),
})
    .strict();
//# sourceMappingURL=company-card.js.map