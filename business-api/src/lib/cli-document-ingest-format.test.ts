import { describe, expect, it } from "vitest";

import { formatDocumentIngestCliOutput } from "./cli-document-ingest-format.js";

describe("formatDocumentIngestCliOutput", () => {
  it("renders a human-readable invoice summary with fenced TOON output for expense invoices", () => {
    const output = formatDocumentIngestCliOutput({
      extracted: {
        invoiceNumber: "FC-2026-0042",
        invoiceDate: "2026-03-26",
        dueDate: "2026-04-24",
        currency: "EUR",
        supplier: {
          name: "Papeleria Centro SL",
        },
        totals: {
          net: "120.00",
          tax: "25.20",
          gross: "145.20",
        },
        taxLines: [{ name: "IVA", rate: "21", base: "120.00", amount: "25.20" }],
        lineItems: [{ description: "Printer paper", quantity: "10", unitPrice: "12.00" }],
        category: "office_supplies",
        notes: "Printer paper and toner.",
        status: "finalized",
      },
      linkedEntity: {
        type: "expense",
        data: {
          expenseId: "exp_000001",
          slug: "steady-green-river-hook",
          supplierContactId: "ct_000245",
          invoiceNumber: "FC-2026-0042",
          invoiceDate: "2026-03-26",
          dueDate: "2026-04-24",
          currency: "EUR",
          totals: {
            net: "120.00",
            tax: "25.20",
            gross: "145.20",
          },
          taxLines: [],
          category: "office_supplies",
          notes: "Printer paper and toner.",
          status: "recorded",
        },
      },
    });

    expect(output).toContain("invoice FC-2026-0042 for Papeleria Centro SL was ingested");
    expect(output).toContain("```toon");
    expect(output).toContain("kind: expense_invoice");
    expect(output).toContain("id: exp_000001");
    expect(output).toContain("slug: steady-green-river-hook");
    expect(output).toContain("supplier:");
    expect(output).toContain("name: Papeleria Centro SL");
    expect(output).toContain("lineItems[1]{description,quantity,unitPrice}:");
  });

  it("returns null when the parsed invoice data is incomplete for the new CLI format", () => {
    expect(
      formatDocumentIngestCliOutput({
        extracted: {
          invoiceNumber: "FC-2026-0042",
          supplier: {
            name: "Papeleria Centro SL",
          },
        },
        linkedEntity: {
          type: "expense",
          data: {
            expenseId: "exp_000001",
            slug: "steady-green-river-hook",
            supplierContactId: "ct_000245",
            invoiceNumber: "FC-2026-0042",
            invoiceDate: "2026-03-26",
            dueDate: "2026-04-24",
            currency: "EUR",
            totals: {
              net: "120.00",
              tax: "25.20",
              gross: "145.20",
            },
            taxLines: [],
            category: "office_supplies",
            notes: "Printer paper and toner.",
            status: "recorded",
          },
        },
      }),
    ).toBeNull();
  });
});
