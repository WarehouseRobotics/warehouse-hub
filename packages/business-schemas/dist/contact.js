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
export const contactResolveInputSchema = z
    .object({
    autoCreate: z.boolean().default(false),
    matchBy: z.array(z.enum(["taxId", "email", "legalName", "canonicalName"])).min(1),
    contact: contactInputSchema,
})
    .strict();
//# sourceMappingURL=contact.js.map