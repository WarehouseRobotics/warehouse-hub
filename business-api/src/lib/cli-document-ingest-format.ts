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

  return null;
}

export function formatDocumentIngestCliOutput(response: IngestResponseLike): string | null {
  const payload = buildInvoicePayload(response);
  if (!payload) {
    return null;
  }

  return `${payload.label}\n\n\`\`\`toon\n${encode(payload.invoice)}\n\`\`\``;
}
