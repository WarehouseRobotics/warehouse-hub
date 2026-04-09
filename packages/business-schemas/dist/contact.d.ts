import { z } from "zod";
export declare const contactRolesSchema: z.ZodArray<z.ZodEnum<["customer", "supplier", "both", "owned", "contact"]>, "many">;
export declare const contactInputSchema: z.ZodObject<{
    parentContactId: z.ZodOptional<z.ZodString>;
    type: z.ZodEnum<["person", "company"]>;
    roles: z.ZodArray<z.ZodEnum<["customer", "supplier", "both", "owned", "contact"]>, "many">;
    displayName: z.ZodString;
    legalName: z.ZodOptional<z.ZodString>;
    taxId: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
    phone: z.ZodOptional<z.ZodString>;
    billingAddress: z.ZodOptional<z.ZodObject<{
        street1: z.ZodString;
        street2: z.ZodOptional<z.ZodString>;
        city: z.ZodString;
        postalCode: z.ZodString;
        countryCode: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        street1: string;
        city: string;
        postalCode: string;
        countryCode: string;
        street2?: string | undefined;
    }, {
        street1: string;
        city: string;
        postalCode: string;
        countryCode: string;
        street2?: string | undefined;
    }>>;
    notes: z.ZodOptional<z.ZodString>;
    status: z.ZodDefault<z.ZodEnum<["active", "inactive"]>>;
}, "strict", z.ZodTypeAny, {
    type: "person" | "company";
    status: "active" | "inactive";
    displayName: string;
    roles: ("customer" | "supplier" | "both" | "owned" | "contact")[];
    legalName?: string | undefined;
    taxId?: string | undefined;
    email?: string | undefined;
    phone?: string | undefined;
    parentContactId?: string | undefined;
    billingAddress?: {
        street1: string;
        city: string;
        postalCode: string;
        countryCode: string;
        street2?: string | undefined;
    } | undefined;
    notes?: string | undefined;
}, {
    type: "person" | "company";
    displayName: string;
    roles: ("customer" | "supplier" | "both" | "owned" | "contact")[];
    status?: "active" | "inactive" | undefined;
    legalName?: string | undefined;
    taxId?: string | undefined;
    email?: string | undefined;
    phone?: string | undefined;
    parentContactId?: string | undefined;
    billingAddress?: {
        street1: string;
        city: string;
        postalCode: string;
        countryCode: string;
        street2?: string | undefined;
    } | undefined;
    notes?: string | undefined;
}>;
export declare const contactPatchSchema: z.ZodObject<{
    parentContactId: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    type: z.ZodOptional<z.ZodEnum<["person", "company"]>>;
    roles: z.ZodOptional<z.ZodArray<z.ZodEnum<["customer", "supplier", "both", "owned", "contact"]>, "many">>;
    displayName: z.ZodOptional<z.ZodString>;
    legalName: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    taxId: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    email: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    phone: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    billingAddress: z.ZodOptional<z.ZodOptional<z.ZodObject<{
        street1: z.ZodString;
        street2: z.ZodOptional<z.ZodString>;
        city: z.ZodString;
        postalCode: z.ZodString;
        countryCode: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        street1: string;
        city: string;
        postalCode: string;
        countryCode: string;
        street2?: string | undefined;
    }, {
        street1: string;
        city: string;
        postalCode: string;
        countryCode: string;
        street2?: string | undefined;
    }>>>;
    notes: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodEnum<["active", "inactive"]>>>;
}, "strict", z.ZodTypeAny, {
    type?: "person" | "company" | undefined;
    status?: "active" | "inactive" | undefined;
    legalName?: string | undefined;
    displayName?: string | undefined;
    taxId?: string | undefined;
    email?: string | undefined;
    phone?: string | undefined;
    parentContactId?: string | undefined;
    roles?: ("customer" | "supplier" | "both" | "owned" | "contact")[] | undefined;
    billingAddress?: {
        street1: string;
        city: string;
        postalCode: string;
        countryCode: string;
        street2?: string | undefined;
    } | undefined;
    notes?: string | undefined;
}, {
    type?: "person" | "company" | undefined;
    status?: "active" | "inactive" | undefined;
    legalName?: string | undefined;
    displayName?: string | undefined;
    taxId?: string | undefined;
    email?: string | undefined;
    phone?: string | undefined;
    parentContactId?: string | undefined;
    roles?: ("customer" | "supplier" | "both" | "owned" | "contact")[] | undefined;
    billingAddress?: {
        street1: string;
        city: string;
        postalCode: string;
        countryCode: string;
        street2?: string | undefined;
    } | undefined;
    notes?: string | undefined;
}>;
export declare const contactResolveInputSchema: z.ZodObject<{
    autoCreate: z.ZodDefault<z.ZodBoolean>;
    matchBy: z.ZodArray<z.ZodEnum<["taxId", "email", "legalName", "canonicalName"]>, "many">;
    contact: z.ZodObject<{
        parentContactId: z.ZodOptional<z.ZodString>;
        type: z.ZodEnum<["person", "company"]>;
        roles: z.ZodArray<z.ZodEnum<["customer", "supplier", "both", "owned", "contact"]>, "many">;
        displayName: z.ZodString;
        legalName: z.ZodOptional<z.ZodString>;
        taxId: z.ZodOptional<z.ZodString>;
        email: z.ZodOptional<z.ZodString>;
        phone: z.ZodOptional<z.ZodString>;
        billingAddress: z.ZodOptional<z.ZodObject<{
            street1: z.ZodString;
            street2: z.ZodOptional<z.ZodString>;
            city: z.ZodString;
            postalCode: z.ZodString;
            countryCode: z.ZodString;
        }, "strict", z.ZodTypeAny, {
            street1: string;
            city: string;
            postalCode: string;
            countryCode: string;
            street2?: string | undefined;
        }, {
            street1: string;
            city: string;
            postalCode: string;
            countryCode: string;
            street2?: string | undefined;
        }>>;
        notes: z.ZodOptional<z.ZodString>;
        status: z.ZodDefault<z.ZodEnum<["active", "inactive"]>>;
    }, "strict", z.ZodTypeAny, {
        type: "person" | "company";
        status: "active" | "inactive";
        displayName: string;
        roles: ("customer" | "supplier" | "both" | "owned" | "contact")[];
        legalName?: string | undefined;
        taxId?: string | undefined;
        email?: string | undefined;
        phone?: string | undefined;
        parentContactId?: string | undefined;
        billingAddress?: {
            street1: string;
            city: string;
            postalCode: string;
            countryCode: string;
            street2?: string | undefined;
        } | undefined;
        notes?: string | undefined;
    }, {
        type: "person" | "company";
        displayName: string;
        roles: ("customer" | "supplier" | "both" | "owned" | "contact")[];
        status?: "active" | "inactive" | undefined;
        legalName?: string | undefined;
        taxId?: string | undefined;
        email?: string | undefined;
        phone?: string | undefined;
        parentContactId?: string | undefined;
        billingAddress?: {
            street1: string;
            city: string;
            postalCode: string;
            countryCode: string;
            street2?: string | undefined;
        } | undefined;
        notes?: string | undefined;
    }>;
}, "strict", z.ZodTypeAny, {
    contact: {
        type: "person" | "company";
        status: "active" | "inactive";
        displayName: string;
        roles: ("customer" | "supplier" | "both" | "owned" | "contact")[];
        legalName?: string | undefined;
        taxId?: string | undefined;
        email?: string | undefined;
        phone?: string | undefined;
        parentContactId?: string | undefined;
        billingAddress?: {
            street1: string;
            city: string;
            postalCode: string;
            countryCode: string;
            street2?: string | undefined;
        } | undefined;
        notes?: string | undefined;
    };
    autoCreate: boolean;
    matchBy: ("legalName" | "taxId" | "email" | "canonicalName")[];
}, {
    contact: {
        type: "person" | "company";
        displayName: string;
        roles: ("customer" | "supplier" | "both" | "owned" | "contact")[];
        status?: "active" | "inactive" | undefined;
        legalName?: string | undefined;
        taxId?: string | undefined;
        email?: string | undefined;
        phone?: string | undefined;
        parentContactId?: string | undefined;
        billingAddress?: {
            street1: string;
            city: string;
            postalCode: string;
            countryCode: string;
            street2?: string | undefined;
        } | undefined;
        notes?: string | undefined;
    };
    matchBy: ("legalName" | "taxId" | "email" | "canonicalName")[];
    autoCreate?: boolean | undefined;
}>;
export type ContactInput = z.infer<typeof contactInputSchema>;
export type ContactPatch = z.infer<typeof contactPatchSchema>;
export type ContactType = ContactInput["type"];
export type ContactResolveInput = z.infer<typeof contactResolveInputSchema>;
