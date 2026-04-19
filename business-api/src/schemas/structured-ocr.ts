import { z } from "zod";

export const structuredInvoiceAddressSchema = z
  .object({
    street1: z.string().min(1).nullable(),
    street2: z.string().min(1).nullable(),
    city: z.string().min(1).nullable(),
    postalCode: z.string().min(1).nullable(),
    countryCode: z.string().length(2).nullable(),
  })
  .strict();

export const structuredInvoicePartySchema = z
  .object({
    displayName: z.string().min(1),
    legalName: z.string().min(1).describe("Legal name of the party, if not provided, same as displayName"),
    taxId: z.string().min(1).nullable(),
    email: z.string().email().nullable(),
    phone: z.string().min(1).nullable(),
    address: structuredInvoiceAddressSchema.nullable(),
  })
  .strict();

export const structuredInvoiceMoneySchema = z
  .object({
    net: z.string().min(1).describe("Net amount of the invoice, no currency symbols"),
    tax: z.string().min(1).describe("Tax amount of the invoice, no currency symbols"),
    gross: z.string().min(1).describe("Gross amount of the invoice, no currency symbols"),
  })
  .strict();

export const structuredInvoiceTaxLineSchema = z
  .object({
    name: z.string().min(1),
    rate: z.string().min(1),
    base: z.string().min(1),
    amount: z.string().min(1).describe("Amount of the tax line, no currency symbols"),
  })
  .strict();

export const structuredInvoiceLineItemSchema = z
  .object({
    description: z.string().min(1),
    quantity: z.string().min(1),
    unitPrice: z.string().min(1),
    taxRate: z.string().min(1),
    total: z.string().min(1).describe("Total amount of the line item, no currency symbols"),
  })
  .strict();

export const structuredInvoiceSchema = z
  .object({
    schemaVersion: z.literal("invoice.v1"),
    documentType: z.enum(["expense_invoice", "sales_invoice", "invoice"]),
    invoiceNumber: z.string().min(1).describe("Identifiable invoice number"),
    invoiceDate: z.string().min(10).max(10).describe("Invoice date"),
    issueDate: z.string().min(1).nullable().describe("Issue date, often same as invoice date"),
    dueDate: z.string().min(1).nullable().describe("Due date until when it is due to be paid"),
    serviceDate: z.string().min(1).nullable(),
    currency: z.string().length(3),
    paymentTermsDays: z.number().int().positive().nullable(),
    seller: structuredInvoicePartySchema,
    buyer: structuredInvoicePartySchema,
    totals: structuredInvoiceMoneySchema,
    taxLines: z.array(structuredInvoiceTaxLineSchema),
    lineItems: z.array(structuredInvoiceLineItemSchema),
    notes: z.string().min(1).nullable(),
    rawText: z.string().min(1),
    pageNotes: z.array(z.string().min(1)).nullable(),
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
      invoiceNumber: { type: "string", description: "Identifiable invoice number" },
      invoiceDate: { type: "string", minLength: 10, maxLength: 10, description: "Invoice date, like YYYY-MM-DD" },
      issueDate: { type: ["string", "null"], description: "Issue date, often same as invoice date, like YYYY-MM-DD" },
      dueDate: { type: ["string", "null"], description: "Due date until when it is due to be paid, like YYYY-MM-DD" },
      serviceDate: { type: ["string", "null"], description: "Service period end date, like YYYY-MM-DD" },
      currency: { type: ["string", "null"], minLength: 3, maxLength: 3, description: "Currency code, like EUR, USD, GBP, etc." },
      paymentTermsDays: { type: ["integer", "null"], minimum: 1, description: "Payment terms days" },
      seller: {
        type: ["object", "null"],
        additionalProperties: false,
        description: "Seller/supplier party",
        properties: {
          displayName: { type: ["string", "null"] },
          legalName: { type: ["string", "null"] },
          taxId: { type: ["string", "null"] },
          email: { type: ["string", "null"] },
          phone: { type: ["string", "null"] },
          address: {
            type: ["object", "null"],
            additionalProperties: false,
            properties: {
              street1: { type: ["string", "null"] },
              street2: { type: ["string", "null"] },
              city: { type: ["string", "null"] },
              postalCode: { type: ["string", "null"] },
              countryCode: { type: ["string", "null"], description: "Country code, like US, ES, FR, DE, etc.", minLength: 2, maxLength: 2 }
            },
            required: ["street1", "street2", "city", "postalCode", "countryCode"]
          }
        },
        required: ["displayName", "legalName", "taxId", "email", "phone", "address"]
      },
      buyer: {
        type: ["object", "null"],
        additionalProperties: false,
        description: "Buyer/client party",
        properties: {
          displayName: { type: ["string", "null"] },
          legalName: { type: ["string", "null"] },
          taxId: { type: ["string", "null"] },
          email: { type: ["string", "null"] },
          phone: { type: ["string", "null"] },
          address: {
            type: ["object", "null"],
            additionalProperties: false,
            properties: {
              street1: { type: ["string", "null"] },
              street2: { type: ["string", "null"] },
              city: { type: ["string", "null"] },
              postalCode: { type: ["string", "null"] },
              countryCode: { type: ["string", "null"], description: "Country code, like US, ES, FR, DE, etc.", minLength: 2, maxLength: 2 }
            },
            required: ["street1", "street2", "city", "postalCode", "countryCode"]
          }
        },
        required: ["displayName", "legalName", "taxId", "email", "phone", "address"]
      },
      totals: {
        type: "object",
        additionalProperties: false,
        properties: {
          net: { type: "string", description: "Numerical string with net amount of the invoice, no currency symbols" },
          tax: { type: "string", description: "Numerical string with tax amount of the invoice, no currency symbols" },
          gross: { type: "string", description: "Numerical string with gross amount of the invoice, no currency symbols" },
        },
        required: ["net", "tax", "gross"]
      },
      taxLines: {
        type: ["array", "null"],
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: ["string", "null"] },
            rate: { type: "string" },
            base: { type: "string" },
            amount: { type: "string", description: "Numerical string with amount of the tax line, no currency symbols" }
          },
          required: ["name", "rate", "base", "amount"]
        }
      },
      lineItems: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            description: { type: "string" },
            quantity: { type: "string", description: "Numerical string with item quantity" },
            unitPrice: { type: "string", description: "Unit price of the line item, no currency symbols" },
            taxRate: { type: "string" },
            total: { type: "string", description: "Total amount of the line item, no currency symbols" }
          },
          required: ["description", "quantity", "unitPrice", "taxRate", "total"]
        },
      },
      notes: { type: ["string", "null"] },
      rawText: { type: "string" },
      pageNotes: {
        type: ["array", "null"],
        items: { type: "string" }
      }
    },
    required: [
      "schemaVersion",
      "documentType",
      "invoiceNumber",
      "invoiceDate",
      "issueDate",
      "dueDate",
      "serviceDate",
      "currency",
      "paymentTermsDays",
      "seller",
      "buyer",
      "totals",
      "taxLines",
      "lineItems",
      "notes",
      "rawText",
      "pageNotes"
    ]
  }
} as const;
