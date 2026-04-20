import { z } from "zod";

export const payrollAmountSchema = z.string().min(1);

export const payrollStatusSchema = z.enum(["recorded", "paid", "void"]);

export const payrollRawLineSchema = z
  .object({
    label: z.string().min(1),
    category: z.enum(["earning", "deduction", "withholding", "employee_contribution", "employer_contribution", "other"]),
    amount: payrollAmountSchema.nullable(),
    rate: z.string().optional(),
    base: z.string().optional(),
    notes: z.string().optional(),
  })
  .strict();

export const payrollInputSchema = z
  .object({
    employeeContactId: z.string().min(1),
    documentId: z.string().optional(),
    payrollNumber: z.string().optional(),
    countryCode: z.string().length(2).optional(),
    periodStart: z.string().min(10).max(10),
    periodEnd: z.string().min(10).max(10),
    paymentDate: z.string().min(10).max(10).optional(),
    currency: z.string().length(3),
    grossSalary: payrollAmountSchema,
    netSalary: payrollAmountSchema,
    employeeTaxWithheld: payrollAmountSchema.default("0.00"),
    employeeSocialContributions: payrollAmountSchema.default("0.00"),
    employerSocialContributions: payrollAmountSchema.default("0.00"),
    otherDeductions: payrollAmountSchema.default("0.00"),
    otherEarnings: payrollAmountSchema.default("0.00"),
    rawLines: z.array(payrollRawLineSchema).optional(),
    notes: z.string().optional(),
    status: payrollStatusSchema.default("recorded"),
  })
  .strict();

export const payrollPatchSchema = payrollInputSchema.partial();

export type PayrollInput = z.infer<typeof payrollInputSchema>;
export type PayrollPatch = z.infer<typeof payrollPatchSchema>;
export type PayrollRawLine = z.infer<typeof payrollRawLineSchema>;
