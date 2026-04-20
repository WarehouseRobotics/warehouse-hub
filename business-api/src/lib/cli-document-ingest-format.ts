import { encode } from "@toon-format/toon";

type ExtractedParty = {
  name?: string;
  legalName?: string;
};

type IngestLinkedEntity =
  | {
      type: "expense";
      data: {
        expenseId: string;
        slug?: string;
        supplierContactId: string;
        invoiceNumber: string | null;
        invoiceDate: string | null;
        dueDate: string | null;
        currency: string;
        totals: {
          net: string;
          tax: string;
          gross: string;
        };
        taxLines: unknown[];
        category: string | null;
        notes: string | null;
        status: string;
      };
    }
  | {
      type: "sales_invoice";
      data: {
        salesInvoiceId: string;
        slug?: string;
        invoiceNumber: string;
        status: string;
        issueDate: string;
        serviceDate: string | null;
        dueDate: string | null;
        currency: string;
        paymentTermsDays: number;
        lineItems: unknown[];
        totals: {
          net: string;
          tax: string;
          gross: string;
        };
        pdfDocumentId: string | null;
      };
    }
  | {
      type: "contact";
      data: Record<string, unknown>;
    }
  | {
      type: "payroll";
      data: {
        payrollId: string;
        slug?: string;
        employeeContactId: string;
        payrollNumber: string | null;
        countryCode: string | null;
        periodStart: string;
        periodEnd: string;
        paymentDate: string | null;
        currency: string;
        grossSalary: string;
        netSalary: string;
        employeeTaxWithheld: string;
        employeeSocialContributions: string;
        employerSocialContributions: string;
        otherDeductions: string;
        otherEarnings: string;
        rawLines: unknown[];
        notes: string | null;
        status: string;
      };
    }
  | null;

type IngestResponseLike = {
  extracted: {
    invoiceNumber?: string;
    invoiceDate?: string;
    issueDate?: string;
    dueDate?: string;
    serviceDate?: string;
    currency?: string;
    notes?: string;
    supplier?: ExtractedParty;
    customer?: ExtractedParty;
    totals?: {
      net?: string;
      tax?: string;
      gross?: string;
    };
    taxLines?: Array<Record<string, unknown>>;
    lineItems?: Array<Record<string, unknown>>;
    category?: string;
    paymentTermsDays?: number;
    status?: "draft" | "sent" | "overdue" | "finalized" | "paid" | "cancelled";
    employee?: ExtractedParty;
    payrollNumber?: string;
    countryCode?: string;
    periodStart?: string;
    periodEnd?: string;
    paymentDate?: string;
    grossSalary?: string;
    netSalary?: string;
    employeeTaxWithheld?: string;
    employeeSocialContributions?: string;
    employerSocialContributions?: string;
    otherDeductions?: string;
    otherEarnings?: string;
    rawLines?: Array<Record<string, unknown>>;
    payrollStatus?: "recorded" | "paid" | "void";
  };
  linkedEntity: IngestLinkedEntity;
};

function getPartyName(response: IngestResponseLike): string | undefined {
  if (response.linkedEntity?.type === "expense") {
    return response.extracted.supplier?.name ?? response.extracted.supplier?.legalName;
  }

  if (response.linkedEntity?.type === "sales_invoice") {
    return response.extracted.customer?.name ?? response.extracted.customer?.legalName;
  }

  if (response.linkedEntity?.type === "payroll") {
    return response.extracted.employee?.name ?? response.extracted.employee?.legalName;
  }

  return undefined;
}

function buildInvoicePayload(response: IngestResponseLike) {
  const invoiceNumber = response.extracted.invoiceNumber;
  const lineItems = response.extracted.lineItems;
  const partyName = getPartyName(response);

  if (!invoiceNumber || !Array.isArray(lineItems) || lineItems.length === 0 || !partyName) {
    return null;
  }

  if (response.linkedEntity?.type === "expense") {
    return {
      label: `invoice ${invoiceNumber} for ${partyName} was ingested`,
      invoice: {
        kind: "expense_invoice",
        id: response.linkedEntity.data.expenseId,
        slug: response.linkedEntity.data.slug,
        supplier: {
          name: partyName,
        },
        invoiceNumber,
        invoiceDate: response.extracted.invoiceDate ?? response.linkedEntity.data.invoiceDate ?? undefined,
        dueDate: response.extracted.dueDate ?? response.linkedEntity.data.dueDate ?? undefined,
        currency: response.extracted.currency ?? response.linkedEntity.data.currency,
        totals: response.extracted.totals ?? response.linkedEntity.data.totals,
        taxLines: response.extracted.taxLines ?? response.linkedEntity.data.taxLines,
        lineItems,
        category: response.extracted.category ?? response.linkedEntity.data.category ?? undefined,
        notes: response.extracted.notes ?? response.linkedEntity.data.notes ?? undefined,
        status: response.extracted.status ?? response.linkedEntity.data.status,
      },
    };
  }

  if (response.linkedEntity?.type === "sales_invoice") {
    return {
      label: `invoice ${invoiceNumber} for ${partyName} was ingested`,
      invoice: {
        kind: "sales_invoice",
        id: response.linkedEntity.data.salesInvoiceId,
        slug: response.linkedEntity.data.slug,
        customer: {
          name: partyName,
        },
        invoiceNumber,
        issueDate: response.extracted.issueDate ?? response.linkedEntity.data.issueDate,
        serviceDate: response.extracted.serviceDate ?? response.linkedEntity.data.serviceDate ?? undefined,
        dueDate: response.extracted.dueDate ?? response.linkedEntity.data.dueDate ?? undefined,
        currency: response.extracted.currency ?? response.linkedEntity.data.currency,
        paymentTermsDays:
          response.extracted.paymentTermsDays ?? response.linkedEntity.data.paymentTermsDays ?? undefined,
        totals: response.extracted.totals ?? response.linkedEntity.data.totals,
        lineItems,
        notes: response.extracted.notes ?? undefined,
        status: response.extracted.status ?? response.linkedEntity.data.status,
      },
    };
  }

  if (response.linkedEntity?.type === "payroll") {
    const periodStart = response.extracted.periodStart ?? response.linkedEntity.data.periodStart;
    const periodEnd = response.extracted.periodEnd ?? response.linkedEntity.data.periodEnd;
    if (!periodStart || !periodEnd || !partyName) {
      return null;
    }

    return {
      label: `payroll for ${partyName} was ingested`,
      invoice: {
        kind: "payroll",
        id: response.linkedEntity.data.payrollId,
        slug: response.linkedEntity.data.slug,
        employee: {
          name: partyName,
        },
        payrollNumber: response.extracted.payrollNumber ?? response.linkedEntity.data.payrollNumber ?? undefined,
        countryCode: response.extracted.countryCode ?? response.linkedEntity.data.countryCode ?? undefined,
        periodStart,
        periodEnd,
        paymentDate: response.extracted.paymentDate ?? response.linkedEntity.data.paymentDate ?? undefined,
        currency: response.extracted.currency ?? response.linkedEntity.data.currency,
        grossSalary: response.extracted.grossSalary ?? response.linkedEntity.data.grossSalary,
        netSalary: response.extracted.netSalary ?? response.linkedEntity.data.netSalary,
        employeeTaxWithheld:
          response.extracted.employeeTaxWithheld ?? response.linkedEntity.data.employeeTaxWithheld,
        employeeSocialContributions:
          response.extracted.employeeSocialContributions ?? response.linkedEntity.data.employeeSocialContributions,
        employerSocialContributions:
          response.extracted.employerSocialContributions ?? response.linkedEntity.data.employerSocialContributions,
        otherDeductions: response.extracted.otherDeductions ?? response.linkedEntity.data.otherDeductions,
        otherEarnings: response.extracted.otherEarnings ?? response.linkedEntity.data.otherEarnings,
        rawLines: response.extracted.rawLines ?? response.linkedEntity.data.rawLines,
        notes: response.extracted.notes ?? response.linkedEntity.data.notes ?? undefined,
        status: response.extracted.payrollStatus ?? response.linkedEntity.data.status,
      },
    };
  }

  return null;
}

export function formatDocumentIngestCliOutput(response: IngestResponseLike): string | null {
  const payload = buildInvoicePayload(response);
  if (!payload) {
    return null;
  }

  return `${payload.label}\n\n\`\`\`toon\n${encode(payload.invoice)}\n\`\`\``;
}
