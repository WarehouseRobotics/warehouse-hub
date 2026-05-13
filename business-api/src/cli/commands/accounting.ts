import {
  expenseInputSchema,
  expensePatchSchema,
  payrollInputSchema,
  payrollPatchSchema,
  salesInvoiceGenerateSchema,
  salesInvoicePatchSchema,
} from "@warehouse-hub/business-schemas";

import { mergeExpenseAndPayrollListItems, parseExpenseListCliFilters } from "../../lib/expense-list-cli.js";
import { parseCliListFilters } from "../../lib/list-filters.js";
import { createExpense, getExpense, listExpenses, updateExpense } from "../../services/expenses.js";
import { createPayroll, getPayroll, listPayrolls, updatePayroll } from "../../services/payrolls.js";
import { generateSalesInvoice, getSalesInvoice, listSalesInvoices, updateSalesInvoice } from "../../services/sales-invoices.js";
import { parseJsonArg, throwUnknownCommand, type CliCommandDefinition } from "../core.js";

export const commandDefinitions: CliCommandDefinition[] = [
  {
    scope: "expenses",
    aliases: ["purchase-invoices", "expense-invoices", "bills"],
    help: {
      description: "Manage expense invoices and supplier bills.",
      commands: [
        "create <json>",
        "get <id-or-slug>",
        "list [--status <status>] [--include-payrolls] [--similar <text>] [--limit <n>] [--since <duration>] [--before <date>] [--after <date>]",
        "update <id-or-slug> <json>",
      ],
      examples: [
        'expenses create \'{"supplierContactId":"ct_000245","invoiceNumber":"FC-2026-0042","invoiceDate":"2026-03-25","currency":"EUR"}\'',
        "expenses list --status recorded",
        "expenses list --status recorded --include-payrolls",
        'expenses list --similar "office toner cartridges from papeleria centro" --since 2m',
      ],
    },
    async handler({ subcommand, rest, positionalArgs, context }) {
      if (subcommand === "create") {
        const input = expenseInputSchema.parse(parseJsonArg(rest[0], "expense"));
        context.printJson(createExpense(input));
        return;
      }

      if (subcommand === "get") {
        context.printJson(getExpense(rest[0]));
        return;
      }

      if (subcommand === "list") {
        const filters = parseExpenseListCliFilters(rest);
        if (!filters.includePayrolls) {
          context.printJson(await listExpenses(filters));
          return;
        }

        const expenses = await listExpenses(filters);
        const payrolls = await listPayrolls({
          similar: filters.similar,
          limit: filters.limit,
          since: filters.since,
          before: filters.before,
          after: filters.after,
          status: filters.status,
        });

        context.printJson(mergeExpenseAndPayrollListItems(expenses, payrolls));
        return;
      }

      if (subcommand === "update") {
        const input = expensePatchSchema.parse(parseJsonArg(rest[1], "expense patch"));
        context.printJson(updateExpense(rest[0], input));
        return;
      }

      throwUnknownCommand(positionalArgs);
    },
  },
  {
    scope: "payrolls",
    aliases: ["payroll", "nominas", "nomina"],
    help: {
      description: "Manage imported payroll slips and employee payroll events.",
      commands: [
        "create <json>",
        "get <id-or-slug>",
        "list [--similar <text>] [--limit <n>] [--since <duration>] [--before <date>] [--after <date>]",
        "update <id-or-slug> <json>",
      ],
      examples: [
        'payrolls create \'{"employeeContactId":"ct_000245","periodStart":"2026-03-01","periodEnd":"2026-03-31","currency":"EUR","grossSalary":"3000","netSalary":"2310"}\'',
        "payrolls list --status recorded",
        'documents ingest test_nomina.pdf \'{"kind":"payroll","source":"accountant_upload"}\'',
      ],
    },
    async handler({ subcommand, rest, positionalArgs, context }) {
      if (subcommand === "create") {
        const input = payrollInputSchema.parse(parseJsonArg(rest[0], "payroll"));
        context.printJson(createPayroll(input));
        return;
      }

      if (subcommand === "get") {
        context.printJson(getPayroll(rest[0]));
        return;
      }

      if (subcommand === "list") {
        context.printJson(await listPayrolls(parseCliListFilters(rest)));
        return;
      }

      if (subcommand === "update") {
        const input = payrollPatchSchema.parse(parseJsonArg(rest[1], "payroll patch"));
        context.printJson(updatePayroll(rest[0], input));
        return;
      }

      throwUnknownCommand(positionalArgs);
    },
  },
  {
    scope: "sales-invoices",
    aliases: ["invoice", "invoices", "sales-invoice"],
    help: {
      description: "Generate, inspect, search, and update outgoing sales invoices.",
      commands: [
        "generate <json>",
        "get <id-or-slug>",
        "list [--similar <text>] [--limit <n>] [--since <duration>] [--before <date>] [--after <date>]",
        "update <id-or-slug> <json>",
      ],
      examples: [
        'sales-invoices generate \'{"customerContactId":"ct_000310","dealId":"deal_000041","issueDate":"2026-04-02"}\'',
        "sales-invoices list --status finalized --after 2026-04-01 --before 2026-05-01",
        'sales-invoices list --similar "warehouse audit consulting sprint" --since 1m',
      ],
    },
    async handler({ subcommand, rest, positionalArgs, context }) {
      if (subcommand === "generate") {
        const input = salesInvoiceGenerateSchema.parse(parseJsonArg(rest[0], "sales invoice"));
        context.printJson(generateSalesInvoice(input));
        return;
      }

      if (subcommand === "get") {
        context.printJson(getSalesInvoice(rest[0]));
        return;
      }

      if (subcommand === "list") {
        context.printJson(await listSalesInvoices(parseCliListFilters(rest)));
        return;
      }

      if (subcommand === "update") {
        const input = salesInvoicePatchSchema.parse(parseJsonArg(rest[1], "sales invoice patch"));
        context.printJson(updateSalesInvoice(rest[0], input));
        return;
      }

      throwUnknownCommand(positionalArgs);
    },
  },
];
