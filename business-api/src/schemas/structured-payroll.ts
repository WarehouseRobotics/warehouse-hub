import { z } from "zod";

export const structuredPayrollPartySchema = z
  .object({
    displayName: z.string().min(1).nullable(),
    legalName: z.string().min(1).nullable(),
    taxId: z.string().min(1).nullable(),
    email: z.string().email().nullable(),
  })
  .strict();

export const structuredPayrollRawLineSchema = z
  .object({
    label: z.string().min(1),
    category: z.enum(["earning", "deduction", "withholding", "employee_contribution", "employer_contribution", "other"]),
    amount: z.string().min(1).nullable().describe("Numeric string with the amount of the line, no currency symbols, or null for informational lines"),
    rate: z.string().min(1).nullable(),
    base: z.string().min(1).nullable(),
    notes: z.string().min(1).nullable(),
  })
  .strict();

export const structuredPayrollSchema = z
  .object({
    schemaVersion: z.literal("payroll.v1"),
    documentType: z.literal("payroll"),
    payrollNumber: z.string().min(1).nullable(),
    countryCode: z.string().length(2).nullable(),
    periodStart: z.string().min(10).max(10),
    periodEnd: z.string().min(10).max(10),
    paymentDate: z.string().min(10).max(10).nullable(),
    currency: z.string().length(3),
    employer: structuredPayrollPartySchema.nullable(),
    employee: structuredPayrollPartySchema.nullable(),
    grossSalary: z.string().min(1),
    netSalary: z.string().min(1),
    employeeTaxWithheld: z.string().min(1),
    employeeSocialContributions: z.string().min(1),
    employerSocialContributions: z.string().min(1),
    otherDeductions: z.string().min(1),
    otherEarnings: z.string().min(1),
    rawLines: z.array(structuredPayrollRawLineSchema),
    notes: z.string().min(1).nullable(),
    rawText: z.string().min(1),
    pageNotes: z.array(z.string().min(1)).nullable(),
  })
  .strict();

export type StructuredPayroll = z.output<typeof structuredPayrollSchema>;

export const structuredPayrollJsonSchema = {
  name: "structured_payroll_v1",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      schemaVersion: { type: "string", enum: ["payroll.v1"] },
      documentType: { type: "string", enum: ["payroll"] },
      payrollNumber: { type: ["string", "null"] },
      countryCode: { type: ["string", "null"], minLength: 2, maxLength: 2 },
      periodStart: { type: "string", minLength: 10, maxLength: 10 },
      periodEnd: { type: "string", minLength: 10, maxLength: 10 },
      paymentDate: { type: ["string", "null"], minLength: 10, maxLength: 10 },
      currency: { type: "string", minLength: 3, maxLength: 3 },
      employer: {
        type: ["object", "null"],
        additionalProperties: false,
        properties: {
          displayName: { type: ["string", "null"] },
          legalName: { type: ["string", "null"] },
          taxId: { type: ["string", "null"] },
          email: { type: ["string", "null"] },
        },
        required: ["displayName", "legalName", "taxId", "email"]
      },
      employee: {
        type: ["object", "null"],
        additionalProperties: false,
        properties: {
          displayName: { type: ["string", "null"] },
          legalName: { type: ["string", "null"] },
          taxId: { type: ["string", "null"] },
          email: { type: ["string", "null"] },
        },
        required: ["displayName", "legalName", "taxId", "email"]
      },
      grossSalary: { type: "string" },
      netSalary: { type: "string" },
      employeeTaxWithheld: { type: "string" },
      employeeSocialContributions: { type: "string" },
      employerSocialContributions: { type: "string" },
      otherDeductions: { type: "string" },
      otherEarnings: { type: "string" },
      rawLines: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            label: { type: "string" },
            category: { type: "string", enum: ["earning", "deduction", "withholding", "employee_contribution", "employer_contribution", "other"] },
            amount: { type: ["string", "null"] },
            rate: { type: ["string", "null"] },
            base: { type: ["string", "null"] },
            notes: { type: ["string", "null"] }
          },
          required: ["label", "category", "amount", "rate", "base", "notes"]
        }
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
      "payrollNumber",
      "countryCode",
      "periodStart",
      "periodEnd",
      "paymentDate",
      "currency",
      "employer",
      "employee",
      "grossSalary",
      "netSalary",
      "employeeTaxWithheld",
      "employeeSocialContributions",
      "employerSocialContributions",
      "otherDeductions",
      "otherEarnings",
      "rawLines",
      "notes",
      "rawText",
      "pageNotes"
    ]
  }
} as const;
