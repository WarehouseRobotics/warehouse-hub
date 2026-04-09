import { z } from "zod";
export declare const taxLineSchema: z.ZodObject<{
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
}>;
export declare const expenseTotalsSchema: z.ZodObject<{
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
}>;
export declare const expenseInputSchema: z.ZodObject<{
    supplierContactId: z.ZodString;
    documentId: z.ZodOptional<z.ZodString>;
    invoiceNumber: z.ZodOptional<z.ZodString>;
    invoiceDate: z.ZodOptional<z.ZodString>;
    dueDate: z.ZodOptional<z.ZodString>;
    currency: z.ZodString;
    totals: z.ZodObject<{
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
    }>;
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
    notes: z.ZodOptional<z.ZodString>;
    status: z.ZodDefault<z.ZodEnum<["recorded", "paid", "void"]>>;
}, "strict", z.ZodTypeAny, {
    status: "void" | "recorded" | "paid";
    currency: string;
    supplierContactId: string;
    totals: {
        net: string;
        tax: string;
        gross: string;
    };
    notes?: string | undefined;
    documentId?: string | undefined;
    invoiceNumber?: string | undefined;
    invoiceDate?: string | undefined;
    dueDate?: string | undefined;
    taxLines?: {
        rate: string;
        base: string;
        amount: string;
        name?: string | undefined;
    }[] | undefined;
    category?: string | undefined;
}, {
    currency: string;
    supplierContactId: string;
    totals: {
        net: string;
        tax: string;
        gross: string;
    };
    status?: "void" | "recorded" | "paid" | undefined;
    notes?: string | undefined;
    documentId?: string | undefined;
    invoiceNumber?: string | undefined;
    invoiceDate?: string | undefined;
    dueDate?: string | undefined;
    taxLines?: {
        rate: string;
        base: string;
        amount: string;
        name?: string | undefined;
    }[] | undefined;
    category?: string | undefined;
}>;
export declare const expensePatchSchema: z.ZodObject<{
    supplierContactId: z.ZodOptional<z.ZodString>;
    documentId: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    invoiceNumber: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    invoiceDate: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    dueDate: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    currency: z.ZodOptional<z.ZodString>;
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
    taxLines: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodObject<{
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
    }>, "many">>>;
    category: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    notes: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodEnum<["recorded", "paid", "void"]>>>;
}, "strict", z.ZodTypeAny, {
    status?: "void" | "recorded" | "paid" | undefined;
    currency?: string | undefined;
    notes?: string | undefined;
    supplierContactId?: string | undefined;
    documentId?: string | undefined;
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
}, {
    status?: "void" | "recorded" | "paid" | undefined;
    currency?: string | undefined;
    notes?: string | undefined;
    supplierContactId?: string | undefined;
    documentId?: string | undefined;
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
}>;
export type ExpenseInput = z.infer<typeof expenseInputSchema>;
export type ExpensePatch = z.infer<typeof expensePatchSchema>;
