import { z } from "zod";
export declare const addressSchema: z.ZodObject<{
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
}>;
export declare const companyCardInputSchema: z.ZodObject<{
    legalName: z.ZodString;
    displayName: z.ZodString;
    taxId: z.ZodOptional<z.ZodString>;
    vatId: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
    phone: z.ZodOptional<z.ZodString>;
    website: z.ZodOptional<z.ZodString>;
    address: z.ZodObject<{
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
    }>;
    invoiceDefaults: z.ZodObject<{
        currency: z.ZodString;
        paymentTermsDays: z.ZodDefault<z.ZodNumber>;
        vatMode: z.ZodDefault<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        currency: string;
        paymentTermsDays: number;
        vatMode: string;
    }, {
        currency: string;
        paymentTermsDays?: number | undefined;
        vatMode?: string | undefined;
    }>;
    bankDetails: z.ZodOptional<z.ZodObject<{
        ibanMasked: z.ZodOptional<z.ZodString>;
        bic: z.ZodOptional<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        ibanMasked?: string | undefined;
        bic?: string | undefined;
    }, {
        ibanMasked?: string | undefined;
        bic?: string | undefined;
    }>>;
}, "strict", z.ZodTypeAny, {
    legalName: string;
    displayName: string;
    address: {
        street1: string;
        city: string;
        postalCode: string;
        countryCode: string;
        street2?: string | undefined;
    };
    invoiceDefaults: {
        currency: string;
        paymentTermsDays: number;
        vatMode: string;
    };
    taxId?: string | undefined;
    vatId?: string | undefined;
    email?: string | undefined;
    phone?: string | undefined;
    website?: string | undefined;
    bankDetails?: {
        ibanMasked?: string | undefined;
        bic?: string | undefined;
    } | undefined;
}, {
    legalName: string;
    displayName: string;
    address: {
        street1: string;
        city: string;
        postalCode: string;
        countryCode: string;
        street2?: string | undefined;
    };
    invoiceDefaults: {
        currency: string;
        paymentTermsDays?: number | undefined;
        vatMode?: string | undefined;
    };
    taxId?: string | undefined;
    vatId?: string | undefined;
    email?: string | undefined;
    phone?: string | undefined;
    website?: string | undefined;
    bankDetails?: {
        ibanMasked?: string | undefined;
        bic?: string | undefined;
    } | undefined;
}>;
export type CompanyCardInput = z.infer<typeof companyCardInputSchema>;
