import { z } from "zod";

import { addressSchema } from "./company-card.js";

export const contactRolesSchema = z.array(z.enum(["customer", "supplier", "both", "owned", "contact"])).min(1);

export const contactInputSchema = z
  .object({
    parentContactId: z.string().optional(),
    type: z.enum(["person", "company"]),
    roles: contactRolesSchema,
    displayName: z.string().min(1),
    legalName: z.string().optional(),
    taxId: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    billingAddress: addressSchema.optional(),
    notes: z.string().optional(),
    status: z.enum(["active", "inactive"]).default("active"),
  })
  .strict();

export const contactPatchSchema = contactInputSchema.partial();

export type ContactInput = z.infer<typeof contactInputSchema>;
export type ContactPatch = z.infer<typeof contactPatchSchema>;
