import { z } from "zod";

import { config } from "../config.js";
import { AppError } from "../lib/errors.js";
import { loadStructuredOcrProviderConfig } from "../lib/llm-config.js";
import {
  structuredInvoiceJsonSchema,
  structuredInvoiceSchema,
  type StructuredInvoice,
} from "../schemas/structured-ocr.js";
import { logger } from "../lib/logger.js";

type StructuredOcrPage = {
  mediaType: string;
  data: Buffer;
};

type StructuredOcrResult<T> = {
  data: T;
  engine: string;
  text: string;
};

const chatCompletionResponseSchema = z
  .object({
    model: z.string().min(1).optional(),
    choices: z
      .array(
        z.object({
          message: z.object({
            content: z.union([
              z.string(),
              z.array(
                z.object({
                  type: z.string(),
                  text: z.string().optional(),
                }),
              ),
            ]),
          }),
        }),
      )
      .min(1),
  })
  .passthrough();

function firstMatch(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }

  return undefined;
}

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

  return trimmed;
}

function normalizeAmount(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const compact = value.replace(/[^0-9,.-]/g, "").replace(/,(?=\d{2}$)/, ".");
  return compact || undefined;
}

function parseParty(text: string, labels: string[]) {
  const escapedLabels = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const labelGroup = escapedLabels.join("|");
  const displayName = firstMatch(text, [new RegExp(`(?:${labelGroup})\\s*:\\s*(.+)`, "im")]);
  const taxId = firstMatch(text, [new RegExp(`(?:${labelGroup})\\s+tax id\\s*:\\s*(.+)`, "im")]);
  const email = firstMatch(text, [new RegExp(`(?:${labelGroup})\\s+email\\s*:\\s*(.+)`, "im")]);
  const phone = firstMatch(text, [new RegExp(`(?:${labelGroup})\\s+phone\\s*:\\s*(.+)`, "im")]);

  if (!displayName && !taxId && !email && !phone) {
    return undefined;
  }

  return {
    displayName,
    legalName: displayName,
    taxId: taxId ?? null,
    email: email ?? null,
    phone: phone ?? null,
    address: null,
  };
}

function makeFallbackParty(
  party: ReturnType<typeof parseParty> | undefined,
  fallbackParty: ReturnType<typeof parseParty> | undefined,
  fallbackName: string,
) {
  if (party) {
    return party;
  }

  if (fallbackParty) {
    return {
      displayName: fallbackParty.displayName,
      legalName: fallbackParty.legalName,
      taxId: null,
      email: null,
      phone: null,
      address: null,
    };
  }

  return {
    displayName: fallbackName,
    legalName: fallbackName,
    taxId: null,
    email: null,
    phone: null,
    address: null,
  };
}

function parseStubInvoice(text: string): StructuredInvoice {
  const taxLines = Array.from(
    text.matchAll(/tax line\s*:\s*(?:name=(.*?);\s*)?rate=([^;]+);\s*base=([^;]+);\s*amount=([^\n]+)/gim),
  ).map((match) => ({
    name: match[1]?.trim() || undefined,
    rate: normalizeAmount(match[2]) ?? match[2].trim(),
    base: normalizeAmount(match[3]) ?? match[3].trim(),
    amount: normalizeAmount(match[4]) ?? match[4].trim(),
  }));

  const lineItems = Array.from(
    text.matchAll(
      /line item\s*:\s*description=([^;]+)(?:;\s*quantity=([^;]+))?(?:;\s*unitPrice=([^;]+))?(?:;\s*taxRate=([^;\n]+))?(?:;\s*total=([^\n;]+))?/gim,
    ),
  ).map((match) => ({
    description: match[1].trim(),
    quantity: match[2]?.trim() || undefined,
    unitPrice: normalizeAmount(match[3]) ?? match[3]?.trim(),
    taxRate: normalizeAmount(match[4]) ?? match[4]?.trim(),
    total: normalizeAmount(match[5]) ?? match[5]?.trim(),
  }));

  const parsedSeller = parseParty(text, ["seller", "issuer", "from", "supplier", "vendor"]);
  const parsedBuyer = parseParty(text, ["buyer", "customer", "bill to", "to"]);
  const seller = makeFallbackParty(parsedSeller, parsedBuyer, "Unknown seller");
  const buyer = makeFallbackParty(parsedBuyer, parsedSeller, "Unknown buyer");

  const parsedResult = structuredInvoiceSchema.parse({
    schemaVersion: "invoice.v1",
    documentType: firstMatch(text, [/document type\s*:\s*(expense_invoice|sales_invoice|invoice)/im]) ?? "invoice",
    invoiceNumber: firstMatch(text, [/invoice(?: number| no\.?| #)?\s*:\s*(.+)/im]),
    invoiceDate: parseDateValue(firstMatch(text, [/invoice date\s*:\s*(.+)/im, /date\s*:\s*(.+)/im])),
    issueDate: parseDateValue(firstMatch(text, [/issue date\s*:\s*(.+)/im])) ?? null,
    dueDate: parseDateValue(firstMatch(text, [/due date\s*:\s*(.+)/im])) ?? null,
    serviceDate: parseDateValue(firstMatch(text, [/service date\s*:\s*(.+)/im])) ?? null,
    currency:
      firstMatch(text, [/currency\s*:\s*([A-Z]{3})/im]) ??
      (text.includes("EUR") || text.includes("€") ? "EUR" : undefined),
    paymentTermsDays: Number.parseInt(firstMatch(text, [/payment terms(?: days)?\s*:\s*(\d+)/im]) ?? "", 10) || null,
    seller,
    buyer,
    totals: {
      net: normalizeAmount(firstMatch(text, [/net(?: total)?\s*:\s*([^\n]+)/im])),
      tax: normalizeAmount(firstMatch(text, [/tax(?: total)?\s*:\s*([^\n]+)/im, /vat(?: total)?\s*:\s*([^\n]+)/im])),
      gross: normalizeAmount(firstMatch(text, [/gross(?: total)?\s*:\s*([^\n]+)/im, /total(?: amount)?\s*:\s*([^\n]+)/im])),
    },
    taxLines,
    lineItems,
    notes: firstMatch(text, [/notes?\s*:\s*(.+)/im]) ?? null,
    rawText: text.trim() || undefined,
    pageNotes: text.trim() ? text.split(/\n\s*\n/).map((chunk) => chunk.trim()).filter(Boolean) : null,
  });

  return parsedResult;
}

function getMessageContent(payload: z.infer<typeof chatCompletionResponseSchema>): string {
  const content = payload.choices[0]?.message.content;
  if (typeof content === "string") {
    return content;
  }

  const textPart = content.find((part) => typeof part.text === "string" && part.text.trim().length > 0)?.text;
  if (!textPart) {
    throw new AppError("Structured OCR provider returned an empty response", {
      statusCode: 502,
      code: "structured_ocr_failed",
    });
  }

  return textPart;
}

function renderStructuredText(invoice: StructuredInvoice): string {
  const parts = [
    invoice.rawText,
    invoice.invoiceNumber ? `invoice number: ${invoice.invoiceNumber}` : undefined,
    invoice.invoiceDate ? `invoice date: ${invoice.invoiceDate}` : undefined,
    invoice.issueDate ? `issue date: ${invoice.issueDate}` : undefined,
    invoice.dueDate ? `due date: ${invoice.dueDate}` : undefined,
    invoice.currency ? `currency: ${invoice.currency}` : undefined,
    invoice.seller?.displayName ? `seller: ${invoice.seller.displayName}` : undefined,
    invoice.buyer?.displayName ? `buyer: ${invoice.buyer.displayName}` : undefined,
    invoice.totals?.net ? `net: ${invoice.totals.net}` : undefined,
    invoice.totals?.tax ? `tax: ${invoice.totals.tax}` : undefined,
    invoice.totals?.gross ? `gross: ${invoice.totals.gross}` : undefined,
    invoice.notes,
    ...(invoice.pageNotes ?? []),
  ];

  return parts.filter(Boolean).join("\n").trim();
}

async function runStructuredExtraction<T>({
  pages,
  schemaName,
  schema,
  validator,
  prompt,
}: {
  pages: StructuredOcrPage[];
  schemaName: string;
  schema: object;
  validator: z.ZodType<T>;
  prompt: string;
}): Promise<StructuredOcrResult<T>> {
  if (config.OCR_STUB_MODE) {
    const rawText = Buffer.concat(pages.map((page) => page.data)).toString("utf8").trim();
    if (rawText.startsWith("OCR_ERROR:")) {
      throw new AppError(rawText.slice("OCR_ERROR:".length).trim() || "Structured OCR extraction failed", {
        statusCode: 422,
        code: "structured_ocr_failed",
      });
    }

    const parsed = validator.parse(parseStubInvoice(rawText));
    return {
      data: parsed,
      engine: "structured-stub-ocr",
      text: renderStructuredText(parsed as StructuredInvoice),
    };
  }

  const provider = loadStructuredOcrProviderConfig();
  if (!provider) {
    throw new AppError("Structured OCR provider is not configured", {
      statusCode: 500,
      code: "structured_ocr_not_configured",
    });
  }

  const response = await fetch(`${provider.endpoint}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(provider.apiKey ? { authorization: `Bearer ${provider.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: provider.model_name,
      messages: [
        {
          role: "system",
          content: "## Your Task\n\nExtract structured document data from the supplied page images. The document can be an sales or expense invoice or similar expense document or a contract piece. Respond with a JSON object that matches the provided schema. To the 'notes' add a summary of the invoice items, if any and original invoice notes, if present.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt,
            },
            ...pages.map((page) => ({
              type: "image_url",
              image_url: {
                url: `data:${page.mediaType};base64,${page.data.toString("base64")}`,
              },
            })),
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: schemaName,
          schema,
          strict: true,
        },
      },
    }),
  });

  if (!response.ok) {
    logger.error(`Structured OCR provider request failed with status ${response.status}`, {
      status: response.status,
      body: await safeReadText(response),
    });
    throw new AppError(`Structured OCR provider request failed with status ${response.status}`, {
      statusCode: 502,
      code: "structured_ocr_failed",
      details: await safeReadText(response),
    });
  }

  const payload = chatCompletionResponseSchema.parse(await response.json());
  const message = getMessageContent(payload);

  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(message);
  } catch (error) {
    throw new AppError("Structured OCR provider returned invalid JSON", {
      statusCode: 502,
      code: "structured_ocr_failed",
      details: error instanceof Error ? error.message : String(error),
    });
  }

  const validated = validator.parse(parsedJson);
  return {
    data: validated,
    engine: `structured_ocr:${provider.model_name}`,
    text: renderStructuredText(validated as StructuredInvoice),
  };
}

export async function extractStructuredInvoiceFromPages(
  pages: StructuredOcrPage[],
): Promise<StructuredOcrResult<StructuredInvoice>> {
  return runStructuredExtraction({
    pages,
    schemaName: structuredInvoiceJsonSchema.name,
    schema: structuredInvoiceJsonSchema.schema,
    validator: structuredInvoiceSchema,
    prompt:
      "Parse these invoice scans into structured JSON. Ensure that data expected by the JSON schema is included in the result. Things like but not limited to: invoice identity (like date, number, currency, status), seller/buyer parties, totals, taxes, line items, payment terms, and any available raw OCR notes.",
  });
}

async function safeReadText(response: Response): Promise<string | undefined> {
  try {
    return await response.text();
  } catch {
    return undefined;
  }
}
