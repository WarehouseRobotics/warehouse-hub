import { z } from "zod";
export declare const documentKindSchema: z.ZodEnum<["expense_invoice", "sales_invoice", "contract", "other"]>;
export declare const documentUploadSchema: z.ZodObject<{
    kind: z.ZodEnum<["expense_invoice", "sales_invoice", "contract", "other"]>;
    source: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    kind: "expense_invoice" | "sales_invoice" | "contract" | "other";
    source?: string | undefined;
}, {
    kind: "expense_invoice" | "sales_invoice" | "contract" | "other";
    source?: string | undefined;
}>;
export type DocumentUploadInput = z.infer<typeof documentUploadSchema>;
export declare const documentIngestOverridesSchema: z.ZodObject<{
    invoiceNumber: z.ZodOptional<z.ZodString>;
    invoiceDate: z.ZodOptional<z.ZodString>;
    dueDate: z.ZodOptional<z.ZodString>;
    currency: z.ZodOptional<z.ZodString>;
    notes: z.ZodOptional<z.ZodString>;
} & {
    supplierContactId: z.ZodOptional<z.ZodString>;
    supplierName: z.ZodOptional<z.ZodString>;
    totals: z.ZodOptional<z.ZodObject<{
        net: z.ZodString;
        tax: z.ZodString;
        gross: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        net: string;
        tax: string;
        gross: string;
    }, {
        net: string;
        tax: string;
        gross: string;
    }>>;
    taxLines: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodOptional<z.ZodString>;
        rate: z.ZodString;
        base: z.ZodString;
        amount: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        rate: string;
        base: string;
        amount: string;
        name?: string | undefined;
    }, {
        rate: string;
        base: string;
        amount: string;
        name?: string | undefined;
    }>, "many">>;
    category: z.ZodOptional<z.ZodString>;
    customerContactId: z.ZodOptional<z.ZodString>;
    customerName: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["draft", "finalized", "paid", "cancelled"]>>;
    paymentTermsDays: z.ZodOptional<z.ZodNumber>;
    lineItems: z.ZodOptional<z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>, "many">>;
    issueDate: z.ZodOptional<z.ZodString>;
    serviceDate: z.ZodOptional<z.ZodString>;
    title: z.ZodOptional<z.ZodString>;
    counterpartyContactId: z.ZodOptional<z.ZodString>;
    effectiveDate: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    status?: "paid" | "draft" | "finalized" | "cancelled" | undefined;
    currency?: string | undefined;
    paymentTermsDays?: number | undefined;
    notes?: string | undefined;
    customerContactId?: string | undefined;
    title?: string | undefined;
    lineItems?: Record<string, unknown>[] | undefined;
    supplierContactId?: string | undefined;
    invoiceNumber?: string | undefined;
    invoiceDate?: string | undefined;
    dueDate?: string | undefined;
    totals?: {
        net: string;
        tax: string;
        gross: string;
    } | undefined;
    taxLines?: {
        rate: string;
        base: string;
        amount: string;
        name?: string | undefined;
    }[] | undefined;
    category?: string | undefined;
    supplierName?: string | undefined;
    customerName?: string | undefined;
    issueDate?: string | undefined;
    serviceDate?: string | undefined;
    counterpartyContactId?: string | undefined;
    effectiveDate?: string | undefined;
}, {
    status?: "paid" | "draft" | "finalized" | "cancelled" | undefined;
    currency?: string | undefined;
    paymentTermsDays?: number | undefined;
    notes?: string | undefined;
    customerContactId?: string | undefined;
    title?: string | undefined;
    lineItems?: Record<string, unknown>[] | undefined;
    supplierContactId?: string | undefined;
    invoiceNumber?: string | undefined;
    invoiceDate?: string | undefined;
    dueDate?: string | undefined;
    totals?: {
        net: string;
        tax: string;
        gross: string;
    } | undefined;
    taxLines?: {
        rate: string;
        base: string;
        amount: string;
        name?: string | undefined;
    }[] | undefined;
    category?: string | undefined;
    supplierName?: string | undefined;
    customerName?: string | undefined;
    issueDate?: string | undefined;
    serviceDate?: string | undefined;
    counterpartyContactId?: string | undefined;
    effectiveDate?: string | undefined;
}>;
export declare const documentIngestSchema: z.ZodObject<{
    kind: z.ZodEnum<["expense_invoice", "sales_invoice", "contract"]>;
    companyCardId: z.ZodOptional<z.ZodString>;
    source: z.ZodOptional<z.ZodString>;
    overrides: z.ZodOptional<z.ZodObject<{
        invoiceNumber: z.ZodOptional<z.ZodString>;
        invoiceDate: z.ZodOptional<z.ZodString>;
        dueDate: z.ZodOptional<z.ZodString>;
        currency: z.ZodOptional<z.ZodString>;
        notes: z.ZodOptional<z.ZodString>;
    } & {
        supplierContactId: z.ZodOptional<z.ZodString>;
        supplierName: z.ZodOptional<z.ZodString>;
        totals: z.ZodOptional<z.ZodObject<{
            net: z.ZodString;
            tax: z.ZodString;
            gross: z.ZodString;
        }, "strict", z.ZodTypeAny, {
            net: string;
            tax: string;
            gross: string;
        }, {
            net: string;
            tax: string;
            gross: string;
        }>>;
        taxLines: z.ZodOptional<z.ZodArray<z.ZodObject<{
            name: z.ZodOptional<z.ZodString>;
            rate: z.ZodString;
            base: z.ZodString;
            amount: z.ZodString;
        }, "strict", z.ZodTypeAny, {
            rate: string;
            base: string;
            amount: string;
            name?: string | undefined;
        }, {
            rate: string;
            base: string;
            amount: string;
            name?: string | undefined;
        }>, "many">>;
        category: z.ZodOptional<z.ZodString>;
        customerContactId: z.ZodOptional<z.ZodString>;
        customerName: z.ZodOptional<z.ZodString>;
        status: z.ZodOptional<z.ZodEnum<["draft", "finalized", "paid", "cancelled"]>>;
        paymentTermsDays: z.ZodOptional<z.ZodNumber>;
        lineItems: z.ZodOptional<z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>, "many">>;
        issueDate: z.ZodOptional<z.ZodString>;
        serviceDate: z.ZodOptional<z.ZodString>;
        title: z.ZodOptional<z.ZodString>;
        counterpartyContactId: z.ZodOptional<z.ZodString>;
        effectiveDate: z.ZodOptional<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        status?: "paid" | "draft" | "finalized" | "cancelled" | undefined;
        currency?: string | undefined;
        paymentTermsDays?: number | undefined;
        notes?: string | undefined;
        customerContactId?: string | undefined;
        title?: string | undefined;
        lineItems?: Record<string, unknown>[] | undefined;
        supplierContactId?: string | undefined;
        invoiceNumber?: string | undefined;
        invoiceDate?: string | undefined;
        dueDate?: string | undefined;
        totals?: {
            net: string;
            tax: string;
            gross: string;
        } | undefined;
        taxLines?: {
            rate: string;
            base: string;
            amount: string;
            name?: string | undefined;
        }[] | undefined;
        category?: string | undefined;
        supplierName?: string | undefined;
        customerName?: string | undefined;
        issueDate?: string | undefined;
        serviceDate?: string | undefined;
        counterpartyContactId?: string | undefined;
        effectiveDate?: string | undefined;
    }, {
        status?: "paid" | "draft" | "finalized" | "cancelled" | undefined;
        currency?: string | undefined;
        paymentTermsDays?: number | undefined;
        notes?: string | undefined;
        customerContactId?: string | undefined;
        title?: string | undefined;
        lineItems?: Record<string, unknown>[] | undefined;
        supplierContactId?: string | undefined;
        invoiceNumber?: string | undefined;
        invoiceDate?: string | undefined;
        dueDate?: string | undefined;
        totals?: {
            net: string;
            tax: string;
            gross: string;
        } | undefined;
        taxLines?: {
            rate: string;
            base: string;
            amount: string;
            name?: string | undefined;
        }[] | undefined;
        category?: string | undefined;
        supplierName?: string | undefined;
        customerName?: string | undefined;
        issueDate?: string | undefined;
        serviceDate?: string | undefined;
        counterpartyContactId?: string | undefined;
        effectiveDate?: string | undefined;
    }>>;
    targetSalesInvoiceId: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    kind: "expense_invoice" | "sales_invoice" | "contract";
    source?: string | undefined;
    companyCardId?: string | undefined;
    overrides?: {
        status?: "paid" | "draft" | "finalized" | "cancelled" | undefined;
        currency?: string | undefined;
        paymentTermsDays?: number | undefined;
        notes?: string | undefined;
        customerContactId?: string | undefined;
        title?: string | undefined;
        lineItems?: Record<string, unknown>[] | undefined;
        supplierContactId?: string | undefined;
        invoiceNumber?: string | undefined;
        invoiceDate?: string | undefined;
        dueDate?: string | undefined;
        totals?: {
            net: string;
            tax: string;
            gross: string;
        } | undefined;
        taxLines?: {
            rate: string;
            base: string;
            amount: string;
            name?: string | undefined;
        }[] | undefined;
        category?: string | undefined;
        supplierName?: string | undefined;
        customerName?: string | undefined;
        issueDate?: string | undefined;
        serviceDate?: string | undefined;
        counterpartyContactId?: string | undefined;
        effectiveDate?: string | undefined;
    } | undefined;
    targetSalesInvoiceId?: string | undefined;
}, {
    kind: "expense_invoice" | "sales_invoice" | "contract";
    source?: string | undefined;
    companyCardId?: string | undefined;
    overrides?: {
        status?: "paid" | "draft" | "finalized" | "cancelled" | undefined;
        currency?: string | undefined;
        paymentTermsDays?: number | undefined;
        notes?: string | undefined;
        customerContactId?: string | undefined;
        title?: string | undefined;
        lineItems?: Record<string, unknown>[] | undefined;
        supplierContactId?: string | undefined;
        invoiceNumber?: string | undefined;
        invoiceDate?: string | undefined;
        dueDate?: string | undefined;
        totals?: {
            net: string;
            tax: string;
            gross: string;
        } | undefined;
        taxLines?: {
            rate: string;
            base: string;
            amount: string;
            name?: string | undefined;
        }[] | undefined;
        category?: string | undefined;
        supplierName?: string | undefined;
        customerName?: string | undefined;
        issueDate?: string | undefined;
        serviceDate?: string | undefined;
        counterpartyContactId?: string | undefined;
        effectiveDate?: string | undefined;
    } | undefined;
    targetSalesInvoiceId?: string | undefined;
}>;
export type DocumentIngestInput = z.infer<typeof documentIngestSchema>;
export type DocumentIngestOverrides = z.infer<typeof documentIngestOverridesSchema>;
