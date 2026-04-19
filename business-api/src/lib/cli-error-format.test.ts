import { describe, expect, it } from "vitest";

import { formatCliErrorAsMarkdown, isTruthyEnvValue } from "./cli-error-format.js";

describe("formatCliErrorAsMarkdown", () => {
  it("renders a stable markdown error report with a summary", () => {
    const cause = new Error("Company card is missing");
    const error = new Error("FOREIGN KEY constraint failed", { cause });
    error.name = "SqliteError";
    error.stack = "SqliteError: FOREIGN KEY constraint failed\n    at importSalesInvoice (sales-invoices.ts:263:8)";

    expect(formatCliErrorAsMarkdown("documents ingest invoice.pdf", error)).toBe(
      [
        "# Business API CLI Error",
        "",
        "## Command",
        "",
        "`documents ingest invoice.pdf`",
        "",
        "## Error Type",
        "",
        "`SqliteError`",
        "",
        "## Error Message",
        "",
        "FOREIGN KEY constraint failed",
        "",
        "## Cause Chain",
        "",
        "1. FOREIGN KEY constraint failed",
        "2. Company card is missing",
        "",
        "## Stack Trace",
        "",
        "```text",
        "SqliteError: FOREIGN KEY constraint failed\n    at importSalesInvoice (sales-invoices.ts:263:8)",
        "```",
        "",
        "## Error Message Summary",
        "",
        "FOREIGN KEY constraint failed",
      ].join("\n"),
    );
  });
});

describe("isTruthyEnvValue", () => {
  it("recognizes common truthy environment values", () => {
    expect(isTruthyEnvValue("true")).toBe(true);
    expect(isTruthyEnvValue("YES")).toBe(true);
    expect(isTruthyEnvValue("0")).toBe(false);
    expect(isTruthyEnvValue(undefined)).toBe(false);
  });
});
