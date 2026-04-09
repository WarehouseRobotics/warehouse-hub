import { z } from "zod";
export declare const salesInvoiceGenerateSchema: z.ZodObject<{
    customerContactId: z.ZodString;
    dealId: z.ZodOptional<z.ZodString>;
    issueDate: z.ZodString;
    serviceDate: z.ZodOptional<z.ZodString>;
    paymentTermsDays: z.ZodDefault<z.ZodNumber>;
    invoiceNumberStrategy: z.ZodDefault<z.ZodEnum<["next"]>>;
}, "strict", z.ZodTypeAny, {
    paymentTermsDays: number;
    customerContactId: string;
    issueDate: string;
    invoiceNumberStrategy: "next";
    serviceDate?: string | undefined;
    dealId?: string | undefined;
}, {
    customerContactId: string;
    issueDate: string;
    paymentTermsDays?: number | undefined;
    serviceDate?: string | undefined;
    dealId?: string | undefined;
    invoiceNumberStrategy?: "next" | undefined;
}>;
export declare const salesInvoicePatchSchema: z.ZodObject<{
    serviceDate: z.ZodOptional<z.ZodString>;
    dueDate: z.ZodOptional<z.ZodString>;
    paymentTermsDays: z.ZodOptional<z.ZodNumber>;
    status: z.ZodOptional<z.ZodEnum<["draft", "finalized", "paid", "cancelled"]>>;
    pdfDocumentId: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    status?: "paid" | "draft" | "finalized" | "cancelled" | undefined;
    paymentTermsDays?: number | undefined;
    dueDate?: string | undefined;
    serviceDate?: string | undefined;
    pdfDocumentId?: string | undefined;
}, {
    status?: "paid" | "draft" | "finalized" | "cancelled" | undefined;
    paymentTermsDays?: number | undefined;
    dueDate?: string | undefined;
    serviceDate?: string | undefined;
    pdfDocumentId?: string | undefined;
}>;
export type SalesInvoiceGenerateInput = z.infer<typeof salesInvoiceGenerateSchema>;
export type SalesInvoicePatch = z.infer<typeof salesInvoicePatchSchema>;
