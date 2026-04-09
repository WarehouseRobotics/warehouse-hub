import { z } from "zod";
export declare const projectInputSchema: z.ZodObject<{
    ownerEntityId: z.ZodString;
    ownerEntityType: z.ZodEnum<["company_card", "contact"]>;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    status: z.ZodDefault<z.ZodEnum<["active", "archived"]>>;
}, "strict", z.ZodTypeAny, {
    status: "active" | "archived";
    name: string;
    ownerEntityId: string;
    ownerEntityType: "contact" | "company_card";
    description?: string | undefined;
}, {
    name: string;
    ownerEntityId: string;
    ownerEntityType: "contact" | "company_card";
    status?: "active" | "archived" | undefined;
    description?: string | undefined;
}>;
export declare const projectPatchSchema: z.ZodObject<{
    ownerEntityId: z.ZodOptional<z.ZodString>;
    ownerEntityType: z.ZodOptional<z.ZodEnum<["company_card", "contact"]>>;
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodEnum<["active", "archived"]>>>;
}, "strict", z.ZodTypeAny, {
    status?: "active" | "archived" | undefined;
    description?: string | undefined;
    name?: string | undefined;
    ownerEntityId?: string | undefined;
    ownerEntityType?: "contact" | "company_card" | undefined;
}, {
    status?: "active" | "archived" | undefined;
    description?: string | undefined;
    name?: string | undefined;
    ownerEntityId?: string | undefined;
    ownerEntityType?: "contact" | "company_card" | undefined;
}>;
export type ProjectInput = z.infer<typeof projectInputSchema>;
export type ProjectPatch = z.infer<typeof projectPatchSchema>;
