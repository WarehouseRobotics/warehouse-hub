import type {
  ContactInput,
  DocumentIngestInput,
  DocumentIngestOverrides,
} from "@warehouse-hub/business-schemas";
import type { StructuredInvoice } from "../schemas/structured-ocr.js";
import { createExpense, getExpense } from "./expenses.js";
import { resolveContact } from "./contacts.js";
import { createStoredDocument, getDocumentMeta, updateDocumentProcessing } from "./documents.js";
import { extractDocumentText, renderDocumentPages } from "./document-ocr.js";
import { importSalesInvoice } from "./sales-invoices.js";
import { extractStructuredInvoiceFromPages } from "./structured-ocr.js";
import { requireCompanyCardRecord, requireContactRecord } from "./shared.js";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

type ExtractedParty = {
  name?: string;
  legalName?: string;
  taxId?: string;
  email?: string;
  phone?: string;
  billingAddress?: ContactInput["billingAddress"];
};

type ExtractedTotals = {
  net?: string;
  tax?: string;
  gross?: string;
};

type ExtractedLineItem = {
  description: string;
  quantity: string | number;
  unitPrice: string;
  taxRate?: string;
  total?: string;
};

type ExtractedDocumentData = {
  title?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  issueDate?: string;
  dueDate?: string;
  effectiveDate?: string;
  serviceDate?: string;
  currency?: string;
  notes?: string;
  supplier?: ExtractedParty;
  customer?: ExtractedParty;
  counterparty?: ExtractedParty;
  totals?: ExtractedTotals;
  taxLines?: Array<{ name?: string; rate: string; base: string; amount: string }>;
  lineItems?: ExtractedLineItem[];
  category?: string;
  paymentTermsDays?: number;
  status?: "draft" | "finalized" | "paid" | "cancelled";
  structuredData?: StructuredInvoice;
};

type IngestionResponse = {
  document: ReturnType<typeof getDocumentMeta>;
  ocr: {
    status: string;
    engine: string | null;
    text: string | null;
    completedAt: string | null;
  };
  extracted: ExtractedDocumentData;
  appliedOverrides: string[];
  linkedEntity:
    | { type: "expense"; data: ReturnType<typeof getExpense> }
    | { type: "sales_invoice"; data: ReturnType<typeof importSalesInvoice> }
    | { type: "contact"; data: ReturnType<typeof requireContactRecord> }
    | null;
  warnings: string[];
};

function parseDateValue(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const match = trimmed.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
  if (match) {
    return `${match[3]}-${match[2]}-${match[1]}`;
  }

  return undefined;
}

function normalizeAmount(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const compact = value.replace(/[^0-9,.-]/g, "").replace(/,(?=\d{2}$)/, ".");
  return compact ? compact : undefined;
}

function firstMatch(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }

  return undefined;
}

function extractParty(text: string, labels: string[]): ExtractedParty | undefined {
  const escapedLabels = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const group = escapedLabels.join("|");
  const name = firstMatch(text, [new RegExp(`(?:${group})\\s*:\\s*(.+)`, "im")]);
  const taxId = firstMatch(text, [new RegExp(`(?:${group})\\s+tax id\\s*:\\s*(.+)`, "im")]);
  const email = firstMatch(text, [new RegExp(`(?:${group})\\s+email\\s*:\\s*(.+)`, "im")]);

  if (!name && !taxId && !email) {
    return undefined;
  }

  return { name, taxId, email };
}

function extractTaxLines(text: string) {
  const matches = Array.from(
    text.matchAll(/tax line\s*:\s*(?:name=(.*?);\s*)?rate=([^;]+);\s*base=([^;]+);\s*amount=([^\n]+)/gim),
  );

  return matches.map((match) => ({
    name: match[1]?.trim() || undefined,
    rate: normalizeAmount(match[2]) ?? match[2].trim(),
    base: normalizeAmount(match[3]) ?? match[3].trim(),
    amount: normalizeAmount(match[4]) ?? match[4].trim(),
  }));
}

function extractLineItems(text: string) {
  const matches = Array.from(
    text.matchAll(
      /line item\s*:\s*description=(.*?);\s*quantity=([^;]+);\s*unitPrice=([^;]+)(?:;\s*taxRate=([^;\n]+))?(?:;\s*total=([^\n;]+))?/gim,
    ),
  );

  return matches.map((match) => ({
    description: match[1].trim(),
    quantity: match[2].trim(),
    unitPrice: normalizeAmount(match[3]) ?? match[3].trim(),
    taxRate: match[4] ? (normalizeAmount(match[4]) ?? match[4].trim()) : undefined,
    total: match[5] ? (normalizeAmount(match[5]) ?? match[5].trim()) : undefined,
  }));
}

function parseExtractedData(text: string): ExtractedDocumentData {
  const totals = {
    net: normalizeAmount(firstMatch(text, [/net(?: total)?\s*:\s*([^\n]+)/im])),
    tax: normalizeAmount(firstMatch(text, [/tax(?: total)?\s*:\s*([^\n]+)/im, /vat(?: total)?\s*:\s*([^\n]+)/im])),
    gross: normalizeAmount(firstMatch(text, [/gross(?: total)?\s*:\s*([^\n]+)/im, /total(?: amount)?\s*:\s*([^\n]+)/im])),
  };

  const taxLines = extractTaxLines(text);
  const lineItems = extractLineItems(text);

  return {
    title: firstMatch(text, [/contract title\s*:\s*(.+)/im, /title\s*:\s*(.+)/im]),
    invoiceNumber: firstMatch(text, [/invoice(?: number| no\.?| #)?\s*:\s*(.+)/im]),
    invoiceDate: parseDateValue(firstMatch(text, [/invoice date\s*:\s*(.+)/im, /date\s*:\s*(.+)/im])),
    issueDate: parseDateValue(firstMatch(text, [/issue date\s*:\s*(.+)/im])),
    dueDate: parseDateValue(firstMatch(text, [/due date\s*:\s*(.+)/im])),
    effectiveDate: parseDateValue(firstMatch(text, [/effective date\s*:\s*(.+)/im])),
    serviceDate: parseDateValue(firstMatch(text, [/service date\s*:\s*(.+)/im])),
    currency:
      firstMatch(text, [/currency\s*:\s*([A-Z]{3})/im]) ??
      (text.includes("EUR") || text.includes("€") ? "EUR" : undefined),
    notes: firstMatch(text, [/notes?\s*:\s*(.+)/im]),
    supplier: extractParty(text, ["supplier", "vendor", "from"]),
    customer: extractParty(text, ["customer", "bill to", "to"]),
    counterparty: extractParty(text, ["counterparty", "party"]),
    totals: Object.values(totals).some(Boolean) ? totals : undefined,
    taxLines: taxLines.length > 0 ? taxLines : undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    category: firstMatch(text, [/category\s*:\s*(.+)/im]),
    paymentTermsDays: Number.parseInt(firstMatch(text, [/payment terms(?: days)?\s*:\s*(\d+)/im]) ?? "", 10) || undefined,
    status:
      (firstMatch(text, [/status\s*:\s*(draft|finalized|paid|cancelled)/im])?.toLowerCase() as
        | "draft"
        | "finalized"
        | "paid"
        | "cancelled"
        | undefined),
  };
}

function getOverrideFields(overrides: DocumentIngestOverrides | undefined): string[] {
  if (!overrides) {
    return [];
  }

  return Object.entries(overrides)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);
}

function toParsedDate(value: string | undefined): string | undefined {
  return parseDateValue(value) ?? value;
}

function mapStructuredParty(
  party: StructuredInvoice["seller"] | StructuredInvoice["buyer"] | undefined,
): ExtractedParty | undefined {
  if (!party) {
    return undefined;
  }

  const name = party.displayName ?? party.legalName;
  if (!name && !party.taxId && !party.email && !party.phone && !party.address) {
    return undefined;
  }

  return {
    name,
    legalName: party.legalName ? party.legalName : name,
    taxId: party.taxId ? party.taxId : undefined,
    email: party.email ? party.email : undefined,
    phone: party.phone ? party.phone : undefined,
    billingAddress: party.address
      ? {
          street1: party.address.street1 ?? "",
          street2: party.address.street2 ? party.address.street2 : undefined,
          city: party.address.city ?? "",
          postalCode: party.address.postalCode ?? "",
          countryCode: party.address.countryCode ?? "",
        }
      : undefined,
  };
}

function compactBillingAddress(address: ContactInput["billingAddress"] | undefined) {
  if (!address) {
    return undefined;
  }

  if (!address.street1 || !address.city || !address.postalCode || !address.countryCode) {
    return undefined;
  }

  return address;
}

function mapStructuredInvoiceToExtracted(
  structured: StructuredInvoice,
  kind: "expense_invoice" | "sales_invoice" | "expense" | "sales-invoice" | "expense-invoice",
): ExtractedDocumentData {
  const seller = mapStructuredParty(structured.seller);
  const buyer = mapStructuredParty(structured.buyer);
  const supplier = seller ?? buyer;
  const customer = buyer ?? seller;

  return {
    invoiceNumber: structured.invoiceNumber,
    invoiceDate: toParsedDate(structured.invoiceDate),
    issueDate: toParsedDate(structured.issueDate ?? structured.invoiceDate),
    dueDate: structured.dueDate ? toParsedDate(structured.dueDate) : undefined,
    serviceDate: structured.serviceDate ? toParsedDate(structured.serviceDate) : undefined,
    currency: structured.currency,
    notes: structured.notes ? structured.notes : undefined,
    supplier: kind === "expense_invoice" ? supplier : seller,
    customer: kind === "sales_invoice" ? customer : undefined,
    totals: structured.totals,
    taxLines: structured.taxLines,
    lineItems: structured.lineItems,
    paymentTermsDays: structured.paymentTermsDays ? structured.paymentTermsDays : undefined,
    structuredData: structured,
  };
}

function mergeExtractedWithOverrides(
  extracted: ExtractedDocumentData,
  overrides: DocumentIngestOverrides | undefined,
): ExtractedDocumentData {
  if (!overrides) {
    return extracted;
  }

  return {
    ...extracted,
    title: overrides.title ?? extracted.title,
    invoiceNumber: overrides.invoiceNumber ?? extracted.invoiceNumber,
    invoiceDate: overrides.invoiceDate ?? extracted.invoiceDate,
    issueDate: overrides.issueDate ?? extracted.issueDate ?? extracted.invoiceDate,
    dueDate: overrides.dueDate ?? extracted.dueDate,
    effectiveDate: overrides.effectiveDate ?? extracted.effectiveDate,
    serviceDate: overrides.serviceDate ?? extracted.serviceDate,
    currency: overrides.currency ?? extracted.currency,
    notes: overrides.notes ?? extracted.notes,
    supplier: {
      ...extracted.supplier,
      name: overrides.supplierName ?? extracted.supplier?.name,
    },
    customer: {
      ...extracted.customer,
      name: overrides.customerName ?? extracted.customer?.name,
    },
    totals: overrides.totals ?? extracted.totals,
    taxLines: overrides.taxLines ?? extracted.taxLines,
    lineItems: overrides.lineItems ?? extracted.lineItems,
    category: overrides.category ?? extracted.category,
    paymentTermsDays: overrides.paymentTermsDays ?? extracted.paymentTermsDays,
    status: overrides.status ?? extracted.status,
  };
}

function ensureCompanyCard(companyCardId: string | undefined) {
  const company = requireCompanyCardRecord();
  if (companyCardId && companyCardId !== company.id) {
    throw new AppError(`companyCardId does not match the owned company card: ${companyCardId}`, {
      statusCode: 400,
      code: "invalid_company_card",
    });
  }

  return company;
}

function buildContactInput(party: ExtractedParty, role: "supplier" | "customer") {
  const displayName = party.name?.trim();
  if (!displayName) {
    throw new AppError(`Could not resolve ${role} contact from OCR`, {
      statusCode: 422,
      code: "document_extraction_incomplete",
    });
  }

  return {
    type: "company" as const,
    roles: [role],
    displayName,
    legalName: party.legalName?.trim() || displayName,
    taxId: party.taxId,
    email: party.email,
    phone: party.phone,
    billingAddress: compactBillingAddress(party.billingAddress),
    status: "active" as const,
  };
}

function resolvePartyContactId(
  role: "supplier" | "customer",
  party: ExtractedParty | undefined,
  explicitContactId: string | undefined,
): { contactId: string; warning?: string } {
  if (explicitContactId) {
    requireContactRecord(explicitContactId);
    return { contactId: explicitContactId };
  }

  if (!party?.name) {
    throw new AppError(`Missing ${role} identity after OCR and overrides`, {
      statusCode: 422,
      code: "document_extraction_incomplete",
    });
  }

  const resolved = resolveContact({
    autoCreate: true,
    matchBy: ["taxId", "email", "canonicalName", "legalName"],
    contact: buildContactInput(party, role),
  });

  return {
    contactId: resolved.contactId,
    warning: resolved.resolution === "created" ? `Created ${role} contact ${party.name}` : undefined,
  };
}

function requireFinalTotals(totals: ExtractedTotals | undefined) {
  if (!totals?.net || !totals.tax || !totals.gross) {
    throw new AppError("Missing totals after OCR and overrides", {
      statusCode: 422,
      code: "document_extraction_incomplete",
    });
  }

  return {
    net: totals.net,
    tax: totals.tax,
    gross: totals.gross,
  };
}

export async function ingestDocument(
  file: Express.Multer.File,
  input: DocumentIngestInput,
): Promise<IngestionResponse> {
  const company = ensureCompanyCard(input.companyCardId);
  const document = createStoredDocument(file, {
    kind: input.kind,
    source: input.source,
  });
  const warnings: string[] = [];
  const appliedOverrides = getOverrideFields(input.overrides);

  updateDocumentProcessing(document.documentId, {
    ocrStatus: "processing",
    ocrError: null,
    ocrEngine: null,
    extractedData: null,
  });

  try {
    let ocrResult: { engine: string; text: string };
    let parsed: ExtractedDocumentData;

    if (input.kind === "expense_invoice" || input.kind === "sales_invoice" || input.kind === "expense-invoice" || input.kind === "sales-invoice" || input.kind === "expense") {
      const structuredResult = await extractStructuredInvoiceFromPages(renderDocumentPages(file));
      ocrResult = structuredResult;
      parsed = mapStructuredInvoiceToExtracted(structuredResult.data, input.kind);
    } else {
      const textResult = await extractDocumentText(file);
      ocrResult = textResult;
      parsed = parseExtractedData(textResult.text);
    }

    const extracted = mergeExtractedWithOverrides(parsed, input.overrides);
    const completedAt = new Date().toISOString();

    let linkedEntity: IngestionResponse["linkedEntity"] = null;
    let linkedEntityType: string | null = null;
    let linkedEntityId: string | null = null;

    if (input.kind === "expense_invoice" || input.kind === "expense-invoice" || input.kind === "expense") {
      const supplier = resolvePartyContactId(
        "supplier",
        extracted.supplier,
        input.overrides?.supplierContactId,
      );
      if (supplier.warning) {
        warnings.push(supplier.warning);
      }

      if (!extracted.currency) {
        throw new AppError("Missing currency after OCR and overrides", {
          statusCode: 422,
          code: "document_extraction_incomplete",
        });
      }

      const expense = createExpense({
        supplierContactId: supplier.contactId,
        documentId: document.documentId,
        invoiceNumber: extracted.invoiceNumber,
        invoiceDate: extracted.invoiceDate,
        dueDate: extracted.dueDate,
        currency: extracted.currency,
        totals: requireFinalTotals(extracted.totals),
        taxLines: extracted.taxLines,
        lineItems: extracted.lineItems,
        category: extracted.category,
        notes: extracted.notes,
        status: "recorded",
      });

      linkedEntity = { type: "expense", data: expense };
      linkedEntityType = "expense";
      linkedEntityId = expense.expenseId;
    }

    if (input.kind === "sales_invoice" || input.kind === "sales-invoice") {
      const customer = resolvePartyContactId(
        "customer",
        extracted.customer,
        input.overrides?.customerContactId,
      );
      if (customer.warning) {
        warnings.push(customer.warning);
      }

      const invoiceNumber = extracted.invoiceNumber;
      const issueDate = extracted.issueDate ?? extracted.invoiceDate;

      if (!invoiceNumber) {
        throw new AppError("Missing sales invoice number after OCR and overrides", {
          statusCode: 422,
          code: "document_extraction_incomplete",
        });
      }

      if (!extracted.currency) {
        throw new AppError("Missing sales invoice currency after OCR and overrides", {
          statusCode: 422,
          code: "document_extraction_incomplete",
        });
      }

      if (!issueDate) {
        throw new AppError("Missing sales invoice issue date after OCR and overrides", {
          statusCode: 422,
          code: "document_extraction_incomplete",
        });
      }

      const salesInvoice = importSalesInvoice({
        targetSalesInvoiceId: input.targetSalesInvoiceId,
        customerContactId: customer.contactId,
        invoiceNumber,
        issueDate,
        serviceDate: extracted.serviceDate,
        dueDate: extracted.dueDate,
        currency: extracted.currency,
        paymentTermsDays: extracted.paymentTermsDays ?? company.paymentTermsDays,
        lineItems: extracted.lineItems ?? [],
        totals: requireFinalTotals(extracted.totals),
        status: extracted.status,
        pdfDocumentId: document.documentId,
        overrideFields: appliedOverrides,
      });

      linkedEntity = { type: "sales_invoice", data: salesInvoice };
      linkedEntityType = "sales_invoice";
      linkedEntityId = salesInvoice.salesInvoiceId;
    }

    if (input.kind === "contract") {
      const counterpartyId = input.overrides?.counterpartyContactId;
      if (counterpartyId) {
        const record = requireContactRecord(counterpartyId);
        linkedEntity = { type: "contact", data: record };
        linkedEntityType = "contact";
        linkedEntityId = record.id;
      } else if (extracted.counterparty?.name) {
        const resolved = resolveContact({
          autoCreate: true,
          matchBy: ["taxId", "email", "canonicalName", "legalName"],
          contact: buildContactInput(extracted.counterparty, "customer"),
        });
        const record = requireContactRecord(resolved.contactId);
        linkedEntity = { type: "contact", data: record };
        linkedEntityType = "contact";
        linkedEntityId = record.id;
        if (resolved.resolution === "created") {
          warnings.push(`Created counterparty contact ${record.displayName}`);
        }
      }
    }

    const updatedDocument = updateDocumentProcessing(document.documentId, {
      ocrStatus: "completed",
      ocrText: ocrResult.text,
      ocrError: null,
      ocrEngine: ocrResult.engine,
      ocrCompletedAt: completedAt,
      extractedData: extracted,
      linkedEntityType,
      linkedEntityId,
    });

    return {
      document: updatedDocument,
      ocr: {
        status: updatedDocument.ocrStatus,
        engine: updatedDocument.ocrEngine,
        text: updatedDocument.ocrText,
        completedAt: updatedDocument.ocrCompletedAt,
      },
      extracted,
      appliedOverrides,
      linkedEntity,
      warnings,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Document ingestion failed";
    const failedDocument = updateDocumentProcessing(document.documentId, {
      ocrStatus: "failed",
      ocrError: message,
    });

    if (error instanceof AppError) {
      throw new AppError(error.message, {
        statusCode: error.statusCode,
        code: error.code,
        details: {
          ...((typeof error.details === "object" && error.details) ? error.details as Record<string, unknown> : {}),
          documentId: failedDocument.documentId,
        },
      });
    }

    throw error;
  }
}
