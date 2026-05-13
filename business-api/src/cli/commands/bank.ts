import fs from "node:fs";
import path from "node:path";

import {
  bankAccountInputSchema,
  bankAccountPatchSchema,
  bankBalanceSnapshotInputSchema,
  bankCsvImportOptionsSchema,
  bankTransactionInputSchema,
  bankTransactionPatchSchema,
  bankTransactionUpsertSchema,
} from "@warehouse-hub/business-schemas";

import { parseBankCsvRows } from "../../lib/bank-csv.js";
import { parseCliListFilters } from "../../lib/list-filters.js";
import {
  createBankAccount,
  createBankBalanceSnapshot,
  createBankTransaction,
  getBankAccount,
  getBankTransaction,
  importBankTransactionsFromRows,
  listBankAccounts,
  listBankBalanceSnapshots,
  listBankTransactions,
  matchBankTransaction,
  updateBankAccount,
  updateBankTransaction,
  upsertBankTransaction,
} from "../../services/bank.js";
import { uploadDocument as uploadBusinessDocument } from "../../services/documents.js";
import {
  createCliUploadFile,
  listFilterArgsFromOptions,
  parseFlexibleFlagArgs,
  parseJsonArg,
  throwUnknownCommand,
  type CliCommandDefinition,
} from "../core.js";

export const commandDefinitions: CliCommandDefinition[] = [
  {
    scope: "bank-accounts",
    help: {
      description: "Track manually managed bank accounts.",
      commands: ["create <json>", "get <id-or-slug>", "list [--status <status>]", "update <id-or-slug> <json>"],
      examples: [
        'bank-accounts create \'{"bankName":"BBVA","displayName":"Main EUR account","ibanMasked":"ES76********1234","currency":"EUR"}\'',
        "bank-accounts list --status active",
      ],
    },
    handler({ subcommand, rest, positionalArgs, context }) {
      if (subcommand === "create") {
        const input = bankAccountInputSchema.parse(parseJsonArg(rest[0], "bank account"));
        context.printJson(createBankAccount(input));
        return;
      }

      if (subcommand === "get") {
        context.printJson(getBankAccount(rest[0]));
        return;
      }

      if (subcommand === "list") {
        const { options } = parseFlexibleFlagArgs(rest, new Set(["json"]));
        context.printJson(listBankAccounts({ status: options.status }));
        return;
      }

      if (subcommand === "update") {
        const input = bankAccountPatchSchema.parse(parseJsonArg(rest[1], "bank account patch"));
        context.printJson(updateBankAccount(rest[0], input));
        return;
      }

      throwUnknownCommand(positionalArgs);
    },
  },
  {
    scope: "bank-transactions",
    help: {
      description: "Create, upsert, inspect, list, update, and match bank transactions.",
      commands: [
        "create <json>",
        "upsert <json>",
        "get <id-or-slug>",
        "list [--bank-account-id <id>] [--status <status>] [--kind <kind>] [--since <duration>] [--before <date>] [--after <date>]",
        "update <id-or-slug> <json>",
        "match <id-or-slug>",
      ],
      examples: [
        'bank-transactions upsert \'{"bankAccountId":"ba_000001","transactionDate":"2026-04-29","amount":"-340,01","currency":"EUR","description":"Adeudo A Su Cargo","reference":"N 2026119000849489 Gestalea Barcelona","runningBalance":"7809,90","source":"slack_screenshot","documentId":"doc_000123","confidence":"high"}\'',
        "bank-transactions match btx_000001",
      ],
    },
    async handler({ subcommand, rest, positionalArgs, context }) {
      if (subcommand === "create") {
        const input = bankTransactionInputSchema.parse(parseJsonArg(rest[0], "bank transaction"));
        context.printJson(createBankTransaction(input));
        return;
      }

      if (subcommand === "upsert") {
        const input = bankTransactionUpsertSchema.parse(parseJsonArg(rest[0], "bank transaction"));
        context.printJson(upsertBankTransaction(input));
        return;
      }

      if (subcommand === "get") {
        context.printJson(getBankTransaction(rest[0]));
        return;
      }

      if (subcommand === "list") {
        const { options } = parseFlexibleFlagArgs(rest, new Set(["json"]));
        context.printJson(
          await listBankTransactions({
            ...parseCliListFilters(listFilterArgsFromOptions(options)),
            bankAccountId: options["bank-account-id"],
            status: options.status,
            kind: options.kind,
          }),
        );
        return;
      }

      if (subcommand === "update") {
        const input = bankTransactionPatchSchema.parse(parseJsonArg(rest[1], "bank transaction patch"));
        context.printJson(updateBankTransaction(rest[0], input));
        return;
      }

      if (subcommand === "match") {
        context.printJson(matchBankTransaction(rest[0]));
        return;
      }

      throwUnknownCommand(positionalArgs);
    },
  },
  {
    scope: "bank-balances",
    help: {
      description: "Record observed bank balances from screenshots, statements, or manual entry.",
      commands: ["record <json>", "list [--bank-account-id <id>] [--since <duration>] [--before <date>] [--after <date>]"],
      examples: [
        'bank-balances record \'{"bankAccountId":"ba_000001","observedAt":"2026-04-29T13:36:00+02:00","balance":"7809,90","currency":"EUR","source":"slack_screenshot","documentId":"doc_000123"}\'',
      ],
    },
    handler({ subcommand, rest, positionalArgs, context }) {
      if (subcommand === "record") {
        const input = bankBalanceSnapshotInputSchema.parse(parseJsonArg(rest[0], "bank balance snapshot"));
        context.printJson(createBankBalanceSnapshot(input));
        return;
      }

      if (subcommand === "list") {
        const { options } = parseFlexibleFlagArgs(rest, new Set(["json"]));
        context.printJson(
          listBankBalanceSnapshots({
            ...parseCliListFilters(listFilterArgsFromOptions(options)),
            bankAccountId: options["bank-account-id"],
          }),
        );
        return;
      }

      throwUnknownCommand(positionalArgs);
    },
  },
  {
    scope: "bank-imports",
    help: {
      description: "Import bank exports as evidence documents and upsert transactions.",
      commands: ["csv <bank-account-id> <file-path> <json-options>"],
      examples: [
        'bank-imports csv ba_000001 ./exports/bank.csv \'{"dateColumn":"Date","amountColumn":"Amount","descriptionColumn":"Description","referenceColumn":"Reference","balanceColumn":"Balance","defaultCurrency":"EUR"}\'',
      ],
    },
    handler({ subcommand, rest, positionalArgs, context }) {
      if (subcommand === "csv") {
        const bankAccountId = rest[0];
        const filePath = rest[1];
        const options = bankCsvImportOptionsSchema.parse(parseJsonArg(rest[2], "bank CSV import options"));
        if (!bankAccountId || !filePath) {
          throw new Error("Usage: bank-imports csv <bank-account-id> <file-path> <json-options>");
        }

        const fileBuffer = fs.readFileSync(filePath);
        const document = uploadBusinessDocument(
          createCliUploadFile(filePath, fileBuffer, "text/csv", path.basename(filePath) || "bank.csv"),
          {
            kind: "bank_csv",
            source: options.source,
          },
        );
        const rows = parseBankCsvRows(fileBuffer.toString("utf8"), options);
        context.printJson(
          importBankTransactionsFromRows(bankAccountId, rows, { source: options.source, documentId: document.documentId }),
        );
        return;
      }

      throwUnknownCommand(positionalArgs);
    },
  },
];
