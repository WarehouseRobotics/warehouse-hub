import { z } from "zod";

export const structuredInvoiceAddressSchema = z
  .object({
    street1: z.string().min(1).optional(),
    street2: z.string().min(1).optional(),
    city: z.string().min(1).optional(),
    postalCode: z.string().min(1).optional(),
    countryCode: z.string().length(2).optional(),
  })
  .strict();

export const structuredInvoicePartySchema = z
  .object({
    displayName: z.string().min(1).optional(),
    legalName: z.string().min(1).optional(),
    taxId: z.string().min(1).optional(),
    email: z.string().email().optional(),
    phone: z.string().min(1).optional(),
    address: structuredInvoiceAddressSchema.optional(),
  })
  .strict();

export const structuredInvoiceMoneySchema = z
  .object({
    net: z.string().min(1).optional(),
    tax: z.string().min(1).optional(),
    gross: z.string().min(1).optional(),
  })
  .strict();

export const structuredInvoiceTaxLineSchema = z
  .object({
    name: z.string().min(1).optional(),
    rate: z.string().min(1),
    base: z.string().min(1),
    amount: z.string().min(1),
  })
  .strict();

export const structuredInvoiceLineItemSchema = z
  .object({
    description: z.string().min(1),
    quantity: z.string().min(1).optional(),
    unitPrice: z.string().min(1).optional(),
    taxRate: z.string().min(1).optional(),
    total: z.string().min(1).optional(),
  })
  .strict();

export const structuredInvoiceSchema = z
  .object({
    schemaVersion: z.literal("invoice.v1"),
    documentType: z.enum(["expense_invoice", "sales_invoice", "invoice"]).optional(),
    invoiceNumber: z.string().min(1).optional(),
    invoiceDate: z.string().min(1).optional(),
    issueDate: z.string().min(1).optional(),
    dueDate: z.string().min(1).optional(),
    serviceDate: z.string().min(1).optional(),
    currency: z.string().length(3).optional(),
    paymentTermsDays: z.number().int().positive().optional(),
    seller: structuredInvoicePartySchema.optional(),
    buyer: structuredInvoicePartySchema.optional(),
    totals: structuredInvoiceMoneySchema.optional(),
    taxLines: z.array(structuredInvoiceTaxLineSchema).optional(),
    lineItems: z.array(structuredInvoiceLineItemSchema).optional(),
    notes: z.string().min(1).optional(),
    rawText: z.string().min(1).optional(),
    pageNotes: z.array(z.string().min(1)).optional(),
  })
  .strict();

export type StructuredInvoice = z.output<typeof structuredInvoiceSchema>;

export const structuredInvoiceJsonSchema = {
  name: "structured_invoice_v1",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      schemaVersion: { type: "string", enum: ["invoice.v1"] },
      documentType: { type: "string", enum: ["expense_invoice", "sales_invoice", "invoice"] },
      invoiceNumber: { type: "string" },
      invoiceDate: { type: "string" },
      issueDate: { type: "string" },
      dueDate: { type: "string" },
      serviceDate: { type: "string" },
      currency: { type: "string", minLength: 3, maxLength: 3 },
      paymentTermsDays: { type: "integer", minimum: 1 },
      seller: {
        type: "object",
        additionalProperties: false,
        properties: {
          displayName: { type: "string" },
          legalName: { type: "string" },
          taxId: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
          address: {
            type: "object",
            additionalProperties: false,
            properties: {
              street1: { type: "string" },
              street2: { type: "string" },
              city: { type: "string" },
              postalCode: { type: "string" },
              countryCode: { type: "string", minLength: 2, maxLength: 2 },
            },
          },
        },
      },
      buyer: {
        type: "object",
        additionalProperties: false,
        properties: {
          displayName: { type: "string" },
          legalName: { type: "string" },
          taxId: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
          address: {
            type: "object",
            additionalProperties: false,
            properties: {
              street1: { type: "string" },
              street2: { type: "string" },
              city: { type: "string" },
              postalCode: { type: "string" },
              countryCode: { type: "string", minLength: 2, maxLength: 2 },
            },
          },
        },
      },
      totals: {
        type: "object",
        additionalProperties: false,
        properties: {
          net: { type: "string" },
          tax: { type: "string" },
          gross: { type: "string" },
        },
      },
      taxLines: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            rate: { type: "string" },
            base: { type: "string" },
            amount: { type: "string" },
          },
          required: ["rate", "base", "amount"],
        },
      },
      lineItems: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            description: { type: "string" },
            quantity: { type: "string" },
            unitPrice: { type: "string" },
            taxRate: { type: "string" },
            total: { type: "string" },
          },
          required: ["description"],
        },
      },
      notes: { type: "string" },
      rawText: { type: "string" },
      pageNotes: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["schemaVersion"],
  },
} as const;
