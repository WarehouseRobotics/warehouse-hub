import {
  taxReportPaymentLinkCreateInputSchema,
  taxReportPaymentLinkPatchSchema,
  taxReportPaymentReceiptUploadSchema,
} from "@warehouse-hub/business-schemas";

import {
  createTaxReportPaymentLink,
  getTaxReport,
  listTaxCarryforwards,
  listTaxReportPaymentLinks,
  listTaxReports,
  suggestTaxReportPaymentLinks,
  updateTaxReportPaymentLink,
  uploadTaxReportPaymentReceipt,
} from "../../services/tax-reports.js";
import {
  listFilterArgsFromOptions,
  parseFlexibleFlagArgs,
  parseJsonArg,
  readCliUploadFile,
  resolveDocumentCliInputPath,
  throwUnknownCommand,
  type CliCommandDefinition,
} from "../core.js";
import { parseCliListFilters } from "../../lib/list-filters.js";

function readReceiptUploadFile(filePath: string) {
  const resolved = resolveDocumentCliInputPath(filePath);
  return readCliUploadFile(
    resolved,
    resolved.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/png",
  );
}

export const commandDefinitions: CliCommandDefinition[] = [
  {
    scope: "tax-reports",
    help: {
      description: "Inspect tax reports and manage tax payment evidence.",
      commands: [
        "get <id-or-slug>",
        "list [--country-code <code>] [--tax-kind <kind>] [--form-code <code>] [--fiscal-year <year>] [--payment-status <status>] [--similar <text>] [--limit <n>]",
        "suggest-payments <id-or-slug>",
        "attach-receipt <id-or-slug> <file-path> <json>",
      ],
      examples: [
        "tax-reports list --country-code ES --fiscal-year 2026",
        "tax-reports suggest-payments tr_000123",
        'tax-reports attach-receipt tr_000123 ./tax/receipt.pdf \'{"kind":"tax_payment_receipt","source":"authority_portal_download","link":{"amount":"1840.00","currency":"EUR","status":"confirmed","paymentReference":"AEAT-303-Q1"}}\'',
      ],
    },
    async handler({ subcommand, rest, positionalArgs, context }) {
      if (subcommand === "get") {
        context.printJson(getTaxReport(rest[0]));
        return;
      }

      if (subcommand === "list") {
        const { options } = parseFlexibleFlagArgs(rest, new Set(["json"]));
        context.printJson(
          await listTaxReports({
            ...parseCliListFilters(listFilterArgsFromOptions(options)),
            countryCode: options["country-code"],
            taxKind: options["tax-kind"],
            formCode: options["form-code"],
            fiscalYear: options["fiscal-year"]
              ? Number.parseInt(options["fiscal-year"], 10)
              : undefined,
            paymentStatus: options["payment-status"],
          }),
        );
        return;
      }

      if (subcommand === "suggest-payments") {
        context.printJson(suggestTaxReportPaymentLinks(rest[0]));
        return;
      }

      if (subcommand === "attach-receipt") {
        const input = taxReportPaymentReceiptUploadSchema.parse(
          parseJsonArg(rest[2], "tax payment receipt metadata"),
        );
        context.printJson(
          uploadTaxReportPaymentReceipt(
            rest[0],
            readReceiptUploadFile(rest[1]),
            input,
          ),
        );
        return;
      }

      throwUnknownCommand(positionalArgs);
    },
  },
  {
    scope: "tax-report-payment-links",
    help: {
      description: "Review, confirm, or reject tax report payment evidence links.",
      commands: [
        "list [--tax-report-id <id>] [--status <status>]",
        "create <json>",
        "update <id-or-slug> <json>",
      ],
      examples: [
        "tax-report-payment-links list --tax-report-id tr_000123",
        'tax-report-payment-links create \'{"taxReportId":"tr_000123","bankTransactionId":"btx_000041","amount":"1840.00","currency":"EUR","status":"confirmed"}\'',
        'tax-report-payment-links update trpl_000123 \'{"status":"rejected","reason":"Wrong period"}\'',
      ],
    },
    handler({ subcommand, rest, positionalArgs, context }) {
      if (subcommand === "list") {
        const { options } = parseFlexibleFlagArgs(rest, new Set(["json"]));
        context.printJson(
          listTaxReportPaymentLinks({
            taxReportId: options["tax-report-id"],
            status: options.status,
          }),
        );
        return;
      }

      if (subcommand === "create") {
        const input = taxReportPaymentLinkCreateInputSchema.parse(
          parseJsonArg(rest[0], "tax report payment link"),
        );
        context.printJson(createTaxReportPaymentLink(input));
        return;
      }

      if (subcommand === "update") {
        const input = taxReportPaymentLinkPatchSchema.parse(
          parseJsonArg(rest[1], "tax report payment link patch"),
        );
        context.printJson(updateTaxReportPaymentLink(rest[0], input));
        return;
      }

      throwUnknownCommand(positionalArgs);
    },
  },
  {
    scope: "tax-carryforwards",
    help: {
      description: "List tax carryforward balances derived from tax reports.",
      commands: [
        "list [--country-code <code>] [--tax-kind <kind>] [--kind <kind>] [--status <status>] [--origin-fiscal-year <year>] [--include-superseded]",
      ],
      examples: [
        "tax-carryforwards list --country-code ES --status active",
      ],
    },
    handler({ subcommand, rest, positionalArgs, context }) {
      if (subcommand === "list") {
        const { options, booleans } = parseFlexibleFlagArgs(
          rest,
          new Set(["json", "include-superseded"]),
        );
        context.printJson(
          listTaxCarryforwards({
            countryCode: options["country-code"],
            taxKind: options["tax-kind"],
            kind: options.kind,
            status: options.status,
            originFiscalYear: options["origin-fiscal-year"]
              ? Number.parseInt(options["origin-fiscal-year"], 10)
              : undefined,
            includeSuperseded: booleans.has("include-superseded"),
          }),
        );
        return;
      }

      throwUnknownCommand(positionalArgs);
    },
  },
];
