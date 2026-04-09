import { z } from "zod";
export const projectInputSchema = z
    .object({
    ownerEntityId: z.string().min(1),
    ownerEntityType: z.enum(["company_card", "contact"]),
    name: z.string().min(1),
    description: z.string().optional(),
    status: z.enum(["active", "archived"]).default("active"),
})
    .strict();
export const projectPatchSchema = projectInputSchema.partial();
//# sourceMappingURL=project.js.map