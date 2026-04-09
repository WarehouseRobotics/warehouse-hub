import { z } from "zod";
export declare const lineItemSchema: z.ZodObject<{
    description: z.ZodString;
    quantity: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
    unitPrice: z.ZodString;
    taxRate: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    description: string;
    quantity: string | number;
    unitPrice: string;
    taxRate?: string | undefined;
}, {
    description: string;
    quantity: string | number;
    unitPrice: string;
    taxRate?: string | undefined;
}>;
export declare const dealInputSchema: z.ZodObject<{
    customerContactId: z.ZodString;
    title: z.ZodString;
    stage: z.ZodString;
    currency: z.ZodString;
    expectedCloseDate: z.ZodOptional<z.ZodString>;
    lineItems: z.ZodArray<z.ZodObject<{
        description: z.ZodString;
        quantity: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
        unitPrice: z.ZodString;
        taxRate: z.ZodOptional<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        description: string;
        quantity: string | number;
        unitPrice: string;
        taxRate?: string | undefined;
    }, {
        description: string;
        quantity: string | number;
        unitPrice: string;
        taxRate?: string | undefined;
    }>, "many">;
    notes: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    currency: string;
    customerContactId: string;
    title: string;
    stage: string;
    lineItems: {
        description: string;
        quantity: string | number;
        unitPrice: string;
        taxRate?: string | undefined;
    }[];
    notes?: string | undefined;
    expectedCloseDate?: string | undefined;
}, {
    currency: string;
    customerContactId: string;
    title: string;
    stage: string;
    lineItems: {
        description: string;
        quantity: string | number;
        unitPrice: string;
        taxRate?: string | undefined;
    }[];
    notes?: string | undefined;
    expectedCloseDate?: string | undefined;
}>;
export declare const dealPatchSchema: z.ZodObject<{
    customerContactId: z.ZodOptional<z.ZodString>;
    title: z.ZodOptional<z.ZodString>;
    stage: z.ZodOptional<z.ZodString>;
    currency: z.ZodOptional<z.ZodString>;
    expectedCloseDate: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    lineItems: z.ZodOptional<z.ZodArray<z.ZodObject<{
        description: z.ZodString;
        quantity: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
        unitPrice: z.ZodString;
        taxRate: z.ZodOptional<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        description: string;
        quantity: string | number;
        unitPrice: string;
        taxRate?: string | undefined;
    }, {
        description: string;
        quantity: string | number;
        unitPrice: string;
        taxRate?: string | undefined;
    }>, "many">>;
    notes: z.ZodOptional<z.ZodOptional<z.ZodString>>;
}, "strict", z.ZodTypeAny, {
    currency?: string | undefined;
    notes?: string | undefined;
    customerContactId?: string | undefined;
    title?: string | undefined;
    stage?: string | undefined;
    expectedCloseDate?: string | undefined;
    lineItems?: {
        description: string;
        quantity: string | number;
        unitPrice: string;
        taxRate?: string | undefined;
    }[] | undefined;
}, {
    currency?: string | undefined;
    notes?: string | undefined;
    customerContactId?: string | undefined;
    title?: string | undefined;
    stage?: string | undefined;
    expectedCloseDate?: string | undefined;
    lineItems?: {
        description: string;
        quantity: string | number;
        unitPrice: string;
        taxRate?: string | undefined;
    }[] | undefined;
}>;
export type DealInput = z.infer<typeof dealInputSchema>;
export type DealPatch = z.infer<typeof dealPatchSchema>;
export type DealLineItem = z.infer<typeof lineItemSchema>;
