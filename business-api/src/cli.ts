import fs from "node:fs";
import path from "node:path";

import { config } from "./config.js";
import { initializeDatabase } from "./db/connection.js";
import { createApp } from "./app.js";
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
} from "./services/bank.js";
import {
  cancelBooking,
  checkBookingAssignmentConflicts,
  completeBooking,
  createBooking,
  createBookingAvailabilityException,
  getBooking,
  getBookingAssignmentProfile,
  getBookingAvailabilityException,
  listBookingAssignmentProfiles,
  listBookingAvailabilityExceptions,
  listBookings,
  softDeleteBooking,
  softDeleteBookingAssignmentProfile,
  softDeleteBookingAvailabilityException,
  updateBooking,
  updateBookingAvailabilityException,
  upsertBookingAssignmentProfile,
} from "./services/bookings.js";
import { getCompanyCard, upsertCompanyCard } from "./services/company-card.js";
import { createComment, getComment, listComments, updateComment } from "./services/comments.js";
import { createContact, getContact, listContacts, resolveContact } from "./services/contacts.js";
import {
  bulkImport as bulkImportDataCacheEntries,
  createCache,
  getCache,
  listCaches,
  lookup as lookupDataCache,
  upsertEntry as upsertDataCacheEntry,
} from "./services/data-caches.js";
import { createDeal, getDeal, listDeals } from "./services/deals.js";
import { getDocumentDownload, getDocumentMeta, listDocuments, uploadDocument } from "./services/documents.js";
import { ingestDocument } from "./services/document-ingestion.js";
import { createExpense, getExpense, listExpenses, updateExpense } from "./services/expenses.js";
import { createPayroll, getPayroll, listPayrolls, updatePayroll } from "./services/payrolls.js";
import { createProject, getProject, listProjects } from "./services/projects.js";
import { generateSalesInvoice, getSalesInvoice, listSalesInvoices, updateSalesInvoice } from "./services/sales-invoices.js";
import { createTask, getTask, listTasks, updateTask } from "./services/tasks.js";
import {
  companyCardInputSchema,
  bookingAssignmentConflictCheckSchema,
  bookingAssignmentProfileInputSchema,
  bookingAvailabilityExceptionInputSchema,
  bookingAvailabilityExceptionPatchSchema,
  bankAccountInputSchema,
  bankAccountPatchSchema,
  bankBalanceSnapshotInputSchema,
  bankCsvImportOptionsSchema,
  bankTransactionInputSchema,
  bankTransactionPatchSchema,
  bankTransactionUpsertSchema,
  bookingCancelSchema,
  bookingCompleteSchema,
  bookingInputSchema,
  bookingPatchSchema,
  commentInputSchema,
  commentPatchSchema,
  contactInputSchema,
  contactResolveInputSchema,
  dealInputSchema,
  documentIngestSchema,
  documentUploadSchema,
  expenseInputSchema,
  expensePatchSchema,
  payrollInputSchema,
  payrollPatchSchema,
  projectInputSchema,
  salesInvoiceGenerateSchema,
  salesInvoicePatchSchema,
  taskInputSchema,
  taskPatchSchema,
} from "@warehouse-hub/business-schemas";
import { parseBankCsvRows } from "./lib/bank-csv.js";
import { formatDocumentIngestCliOutput } from "./lib/cli-document-ingest-format.js";
import { mergeExpenseAndPayrollListItems, parseExpenseListCliFilters } from "./lib/expense-list-cli.js";
import { parseCliListFilters } from "./lib/list-filters.js";
import { formatCliErrorAsMarkdown, isTruthyEnvValue } from "./lib/cli-error-format.js";
import { logger } from "./lib/logger.js";
import {
  dataCacheBulkImportSchema,
  dataCacheInputSchema,
  dataCacheLookupSchema,
  dataCacheEntryUpsertSchema,
  type JsonObject,
} from "./schemas/data-caches.js";

type HelpScope = {
  description: string;
  commands: string[];
  examples: string[];
  aliases?: string[];
};

const DEFAULT_CLI_PREFIX = "./container.sh exec npm run cli -- ";
const DOCKER_WRAPPER_PREFIX = "wrobo-biz ";

const HELP_SCOPES: Record<string, HelpScope> = {
  db: {
    description: "Database bootstrap and migration tasks.",
    commands: ["init", "migrate"],
    examples: ["db init", "db migrate"],
  },
  "company-card": {
    description: "Read or update the owned company profile used across business workflows.",
    commands: ["get", "set <json>"],
    examples: [
      "company-card get",
      'company-card set \'{"legalName":"Northwind Robotics SL","displayName":"Northwind Robotics"}\'',
    ],
    aliases: ["company"],
  },
  "bank-accounts": {
    description: "Track manually managed bank accounts.",
    commands: ["create <json>", "get <id-or-slug>", "list [--status <status>]", "update <id-or-slug> <json>"],
    examples: [
      'bank-accounts create \'{"bankName":"BBVA","displayName":"Main EUR account","ibanMasked":"ES76********1234","currency":"EUR"}\'',
      "bank-accounts list --status active",
    ],
  },
  "bank-transactions": {
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
  "bank-balances": {
    description: "Record observed bank balances from screenshots, statements, or manual entry.",
    commands: ["record <json>", "list [--bank-account-id <id>] [--since <duration>] [--before <date>] [--after <date>]"],
    examples: [
      'bank-balances record \'{"bankAccountId":"ba_000001","observedAt":"2026-04-29T13:36:00+02:00","balance":"7809,90","currency":"EUR","source":"slack_screenshot","documentId":"doc_000123"}\'',
    ],
  },
  "bank-imports": {
    description: "Import bank exports as evidence documents and upsert transactions.",
    commands: ["csv <bank-account-id> <file-path> <json-options>"],
    examples: [
      'bank-imports csv ba_000001 ./exports/bank.csv \'{"dateColumn":"Date","amountColumn":"Amount","descriptionColumn":"Description","referenceColumn":"Reference","balanceColumn":"Balance","defaultCurrency":"EUR"}\'',
    ],
  },
  bookings: {
    description: "Create, inspect, schedule, complete, and cancel customer bookings.",
    commands: [
      "create <json-or-flags>",
      "get <id-or-slug>",
      "list [--from <iso>] [--to <iso>] [--status <status>] [--customer-contact-id <id>] [--assigned-contact-id <id>] [--project-id <id>] [--deal-id <id>]",
      "update <id-or-slug> <json>",
      "complete <id-or-slug> [--completion-notes <text>] [--create-follow-up-task]",
      "cancel <id-or-slug> --reason <text>",
      "delete <id-or-slug>",
      "check-assignment-conflicts <json-or-flags>",
    ],
    examples: [
      "bookings create --customer-contact-id ct_000245 --title \"Warehouse automation discovery visit\" --service-type visit --status confirmed --start 2026-04-10T09:00:00+02:00 --end 2026-04-10T11:00:00+02:00 --timezone Europe/Madrid --assigned-contact-id ct_emp_000011 --location-kind on_site --location-label \"Acme Retail warehouse\"",
      'bookings create \'{"customerContactId":"ct_000245","title":"Remote onboarding workshop","serviceType":"workshop","status":"tentative","scheduledStartAt":"2026-04-11T14:00:00+02:00","scheduledEndAt":"2026-04-11T16:00:00+02:00","timezone":"Europe/Madrid","assignedContactIds":["ct_emp_000011"],"location":{"kind":"remote","label":"Zoom"}}\'',
      "bookings list --from 2026-04-10T00:00:00Z --to 2026-04-17T00:00:00Z",
      "bookings complete book_000091 --completion-notes \"Site survey completed\" --create-follow-up-task",
    ],
  },
  "booking-assignment-profiles": {
    description: "Configure employee availability for booking assignment.",
    commands: ["list", "get <contact-id>", "set <contact-id> <json-or-flags>", "delete <contact-id>"],
    examples: [
      "booking-assignment-profiles set ct_emp_000011 --timezone Europe/Madrid --availability monday|09:00|13:00 --booking-type visit",
    ],
  },
  "booking-availability-exceptions": {
    description: "Manage one-off employee booking availability exceptions.",
    commands: [
      "create <json-or-flags>",
      "list [--contact-id <id>] [--kind <kind>]",
      "get <id-or-slug>",
      "update <id-or-slug> <json>",
      "delete <id-or-slug>",
    ],
    examples: [
      "booking-availability-exceptions create --contact-id ct_emp_000011 --kind time_off --start 2026-04-10T00:00:00+02:00 --end 2026-04-10T23:59:59+02:00 --reason vacation",
    ],
  },
  comments: {
    description: "Create, inspect, list, and update generic comments attached to business records.",
    commands: [
      "create <json>",
      "get <id-or-slug>",
      "list [--commentable-type <type>] [--commentable-id <id>] [--commentable-slug <slug>] [--author-contact-id <id>]",
      "update <id-or-slug> <json>",
    ],
    examples: [
      'comments create \'{"commentableType":"task","commentableSlug":"prepare-rollout","body":"Customer asked to delay by one week.","authorName":"Hub developer"}\'',
      "comments list --commentable-type task --commentable-id task_000123",
    ],
    aliases: ["comment"],
  },
  contacts: {
    description: "Create, inspect, list, or resolve contacts.",
    commands: ["list", "create <json>", "get <id-or-slug>", "resolve <json>"],
    examples: [
      "contacts list",
      'contacts create \'{"type":"company","status":"active","roles":["customer"],"displayName":"Acme Retail GmbH"}\'',
      'contacts resolve \'{"autoCreate":true,"matchBy":["taxId","email"],"contact":{"type":"company","displayName":"Acme Retail GmbH"}}\'',
    ],
  },
  "data-cache": {
    description: "Manage persistent reference-data caches and lookup missing values via OpenClaw agents.",
    commands: [
      "list",
      "create <slug> --name <display-name> --key-type <type> [--description <text>] [--value-schema <json>] [--fetcher-config <json>] [--ttl-days <days>]",
      "get <slug>",
      "lookup <slug> <key> --strategy <strategy> [--max-staleness-days <days>] [--fetch-timeout-ms <ms>]",
      "upsert <slug> <key> --value <json> [--expires-at <iso-datetime>]",
      "import <slug> --file <path> [--key-col <name>] [--value-col <name>]",
    ],
    examples: [
      "data-cache list",
      'data-cache create currency-rates-eur-usd --name "Currency Rates EUR/USD" --key-type date --value-schema \'{"type":"object","properties":{"rate":{"type":"string"}},"required":["rate"]}\' --fetcher-config \'{"prompt":"Look up EUR/USD rate for {{ key }}. JSON only."}\' --ttl-days 1',
      "data-cache lookup currency-rates-eur-usd 2026-04-26 --strategy staleness_window --max-staleness-days 7",
      'data-cache upsert currency-rates-eur-usd 2026-04-26 --value \'{"rate":"1.0823"}\'',
    ],
    aliases: ["data-caches"],
  },
  documents: {
    description: "Upload, ingest, search, inspect, and download business documents.",
    commands: [
      "upload <file-path> <json-meta>",
      "ingest <file-path> <json-meta>",
      "list [--similar <text>] [--limit <n>] [--since <duration>] [--before <date>] [--after <date>]",
      "get <id-or-slug>",
      "download <id-or-slug> <output-path>",
    ],
    examples: [
      'documents upload ./samples/docs/reference.pdf \'{"kind":"other","source":"manual_upload"}\'',
      'documents ingest ./test-data/expenses/invoice_do_2026_03.pdf \'{"kind":"expense_invoice","source":"email_forward"}\'',
      'documents ingest invoice_do_2026_03.pdf \'{"kind":"expense_invoice","source":"email_forward"}\'',
      "documents list --after 2026-04-01 --before 2026-05-01",
    ],
  },
  expenses: {
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
    aliases: ["purchase-invoices", "expense-invoices", "bills"],
  },
  payrolls: {
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
    aliases: ["payroll", "nominas", "nomina"],
  },
  deals: {
    description: "Create, inspect, and list sales deals.",
    commands: ["create <json>", "get <id-or-slug>", "list"],
    examples: [
      'deals create \'{"title":"Warehouse audit consulting","stage":"qualified"}\'',
      "deals list",
    ],
  },
  "sales-invoices": {
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
    aliases: ["invoice", "invoices", "sales-invoice"],
  },
  projects: {
    description: "Create, inspect, and list projects.",
    commands: ["create <json>", "get <id-or-slug>", "list"],
    examples: [
      'projects create \'{"ownerEntityId":"comp_000001","name":"Customer onboarding"}\'',
      "projects list",
    ],
  },
  tasks: {
    description: "Create, inspect, list, and update tasks.",
    commands: ["create <json>", "get <id-or-slug>", "list", "update <id-or-slug> <json>"],
    examples: [
      'tasks create \'{"projectId":"proj_000101","title":"Review Q2 expense backlog","status":"todo","priority":"high"}\'',
      "tasks list",
      'tasks update task_000123 \'{"status":"done"}\'',
    ],
  },
};

function isWrapperCliInvocation(): boolean {
  return isTruthyEnvValue(process.env.WROBO_BUSINESS_API_CLI_MODE);
}

const TOP_LEVEL_COMMANDS = [
  "help [scope]",
  "serve",
  "db <subcommand>",
  "company-card <subcommand>",
  "bank-accounts <subcommand>",
  "bank-transactions <subcommand>",
  "bank-balances <subcommand>",
  "bank-imports <subcommand>",
  "bookings <subcommand>",
  "booking-assignment-profiles <subcommand>",
  "booking-availability-exceptions <subcommand>",
  "comments <subcommand>",
  "contacts <subcommand>",
  "data-cache <subcommand>",
  "documents <subcommand>",
  "expenses <subcommand>",
  "payrolls <subcommand>",
  "deals <subcommand>",
  "sales-invoices <subcommand>",
  "projects <subcommand>",
  "tasks <subcommand>",
];

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printLines(lines: string[]): void {
  process.stdout.write(`${lines.join("\n")}\n`);
}

function getCliPrefix(args: string[]): string {
  return args.includes("--in-docker") ? DOCKER_WRAPPER_PREFIX : DEFAULT_CLI_PREFIX;
}

function formatExample(command: string, prefix: string): string {
  return `${prefix}${command}`;
}

function parseCommentListFilters(args: string[]): {
  commentableType?: import("@warehouse-hub/business-schemas").CommentableType;
  commentableId?: string;
  commentableSlug?: string;
  authorContactId?: string;
} {
  const values: Record<string, string | undefined> = {};
  const allowedKeys = new Set(["commentable-type", "commentable-id", "commentable-slug", "author-contact-id"]);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg?.startsWith("--")) {
      throw new Error(`Unknown list option: ${arg}`);
    }

    const key = arg.slice(2);
    if (!allowedKeys.has(key)) {
      throw new Error(`Unknown list option: ${arg}`);
    }

    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for option: ${arg}`);
    }

    if (values[key] !== undefined) {
      throw new Error(`Duplicate list option for '${key}': ${arg}`);
    }

    values[key] = value;
    index += 1;
  }

  const commentableType = values["commentable-type"];
  if (
    commentableType !== undefined &&
    commentableType !== "company_card" &&
    commentableType !== "contact" &&
    commentableType !== "document" &&
    commentableType !== "expense" &&
    commentableType !== "payroll" &&
    commentableType !== "deal" &&
    commentableType !== "booking" &&
    commentableType !== "sales_invoice" &&
    commentableType !== "project" &&
    commentableType !== "task"
  ) {
    throw new Error(`Unsupported commentable type: ${commentableType}`);
  }

  return {
    commentableType,
    commentableId: values["commentable-id"],
    commentableSlug: values["commentable-slug"],
    authorContactId: values["author-contact-id"],
  };
}

function getCanonicalScope(scope: string | undefined): string | undefined {
  if (!scope) {
    return undefined;
  }

  if (scope in HELP_SCOPES) {
    return scope;
  }

  const normalizedScope = scope.toLowerCase();

  return Object.entries(HELP_SCOPES).find(([, helpScope]) =>
    helpScope.aliases?.some((alias) => alias.toLowerCase() === normalizedScope),
  )?.[0];
}

function printTopLevelHelp(args: string[]): void {
  const prefix = getCliPrefix(args);
  const scopeNames = Object.keys(HELP_SCOPES);

  printLines([
    "Warehouse Hub Business API CLI",
    "",
    "Top-level commands:",
    ...TOP_LEVEL_COMMANDS.map((command) => `  - ${command}`),
    "",
    "Scopes:",
    ...scopeNames.map((scope) => `  - ${scope}: ${HELP_SCOPES[scope].description}`),
    "",
    "Examples:",
    `  - ${formatExample("help projects", prefix)}`,
    `  - ${formatExample("help invoices", prefix)}`,
    `  - ${formatExample("contacts list", prefix)}`,
  ]);
}

function printScopeHelp(scope: string, args: string[]): void {
  const canonicalScope = getCanonicalScope(scope);

  if (!canonicalScope) {
    const knownScopes = Object.keys(HELP_SCOPES).join(", ");
    throw new Error(`Unknown help scope: ${scope}. Known scopes: ${knownScopes}`);
  }

  const prefix = getCliPrefix(args);
  const helpScope = HELP_SCOPES[canonicalScope];

  printLines([
    `Help for ${canonicalScope}`,
    "",
    helpScope.description,
    "",
    "Commands:",
    ...helpScope.commands.map((command) => `  - ${canonicalScope} ${command}`),
    "",
    "Examples:",
    ...helpScope.examples.map((example) => `  - ${formatExample(example, prefix)}`),
  ]);
}

function parseJsonArg(value: string | undefined, label: string): unknown {
  if (!value) {
    throw new Error(`Missing ${label} JSON argument`);
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch (error) {
    logger.error("Invalid CLI JSON argument", { label, raw: value, error });
    throw new Error(`Invalid ${label} JSON argument: ${value}`, { cause: error });
  }

  return parsed;
}

function resolveDocumentCliInputPath(filePath: string): string {
  if (path.isAbsolute(filePath) || filePath.includes("/") || filePath.includes("\\")) {
    return filePath;
  }

  return path.join(config.tmpDir, filePath);
}

function parseFlagArgs(args: string[]): { positionals: string[]; options: Record<string, string> } {
  const positionals: string[] = [];
  const options: Record<string, string> = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const key = arg.slice(2);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for option: ${arg}`);
    }

    options[key] = value;
    index += 1;
  }

  return { positionals, options };
}

function parseFlexibleFlagArgs(
  args: string[],
  booleanKeys = new Set<string>(),
  repeatableKeys = new Set<string>(),
): { positionals: string[]; options: Record<string, string>; booleans: Set<string>; repeated: Record<string, string[]> } {
  const positionals: string[] = [];
  const options: Record<string, string> = {};
  const booleans = new Set<string>();
  const repeated: Record<string, string[]> = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const key = arg.slice(2);
    if (booleanKeys.has(key)) {
      booleans.add(key);
      continue;
    }

    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for option: ${arg}`);
    }

    if (repeatableKeys.has(key)) {
      repeated[key] = [...(repeated[key] ?? []), value];
    } else {
      options[key] = value;
    }
    index += 1;
  }

  return { positionals, options, booleans, repeated };
}

function parseNumberOption(value: string | undefined): number | undefined {
  return value === undefined ? undefined : Number(value);
}

function parseBookingLocation(options: Record<string, string>) {
  if (!options["location-kind"]) {
    return undefined;
  }

  return {
    kind: options["location-kind"],
    label: options["location-label"],
    address: options["street1"] || options.city || options["postal-code"] || options.country
      ? {
          street1: options["street1"],
          street2: options["street2"],
          city: options.city,
          postalCode: options["postal-code"],
          countryCode: options.country,
        }
      : undefined,
    remoteUrl: options["remote-url"],
    notes: options["location-notes"],
  };
}

function parseBookingInputArg(args: string[]) {
  if (args[0]?.trim().startsWith("{")) {
    return bookingInputSchema.parse(parseJsonArg(args[0], "booking"));
  }

  const { options, repeated } = parseFlexibleFlagArgs(args, new Set(["json"]), new Set(["assigned-contact-id"]));
  return bookingInputSchema.parse({
    customerContactId: options["customer-contact-id"],
    projectId: options["project-id"],
    dealId: options["deal-id"],
    taskId: options["task-id"],
    salesInvoiceId: options["sales-invoice-id"],
    title: options.title,
    serviceType: options["service-type"],
    status: options.status,
    scheduledStartAt: options.start,
    scheduledEndAt: options.end,
    timezone: options.timezone,
    location: parseBookingLocation(options),
    assignedContactIds: repeated["assigned-contact-id"] ?? [],
    notes: options.notes,
  });
}

function parseBookingListFilters(args: string[]) {
  const { options } = parseFlexibleFlagArgs(args, new Set(["json"]));
  return {
    from: options.from,
    to: options.to,
    status: options.status,
    customerContactId: options["customer-contact-id"],
    assignedContactId: options["assigned-contact-id"],
    projectId: options["project-id"],
    dealId: options["deal-id"],
  };
}

function parseBookingConflictCheckArg(args: string[]) {
  if (args[0]?.trim().startsWith("{")) {
    return bookingAssignmentConflictCheckSchema.parse(parseJsonArg(args[0], "booking conflict check"));
  }

  const { options, repeated } = parseFlexibleFlagArgs(args, new Set(["json"]), new Set(["assigned-contact-id"]));
  return bookingAssignmentConflictCheckSchema.parse({
    bookingId: options["booking-id"],
    serviceType: options["service-type"],
    scheduledStartAt: options.start,
    scheduledEndAt: options.end,
    timezone: options.timezone,
    assignedContactIds: repeated["assigned-contact-id"] ?? [],
  });
}

function parseBookingAvailabilityEntries(values: string[] | undefined) {
  const byDay = new Map<string, Array<{ start: string; end: string }>>();
  for (const value of values ?? []) {
    const [dayOfWeek, start, end] = value.split("|");
    if (!dayOfWeek || !start || !end) {
      throw new Error(`Invalid availability value: ${value}. Expected day|HH:MM|HH:MM`);
    }

    byDay.set(dayOfWeek, [...(byDay.get(dayOfWeek) ?? []), { start, end }]);
  }

  return Array.from(byDay.entries()).map(([dayOfWeek, windows]) => ({ dayOfWeek, windows }));
}

function parseBookingAssignmentProfileArg(args: string[]) {
  if (args[0]?.trim().startsWith("{")) {
    return bookingAssignmentProfileInputSchema.parse(parseJsonArg(args[0], "booking assignment profile"));
  }

  const { options, repeated, booleans } = parseFlexibleFlagArgs(
    args,
    new Set(["json", "not-bookable"]),
    new Set(["availability", "booking-type"]),
  );
  return bookingAssignmentProfileInputSchema.parse({
    isBookable: !booleans.has("not-bookable"),
    timezone: options.timezone,
    weeklyAvailability: parseBookingAvailabilityEntries(repeated.availability),
    bufferBeforeMinutes: parseNumberOption(options["buffer-before-minutes"]),
    bufferAfterMinutes: parseNumberOption(options["buffer-after-minutes"]),
    maxBookingsPerDay: parseNumberOption(options["max-bookings-per-day"]),
    bookingTypes: repeated["booking-type"],
    effectiveFrom: options["effective-from"],
    effectiveTo: options["effective-to"],
    notes: options.notes,
  });
}

function parseBookingAvailabilityExceptionArg(args: string[]) {
  if (args[0]?.trim().startsWith("{")) {
    return bookingAvailabilityExceptionInputSchema.parse(parseJsonArg(args[0], "booking availability exception"));
  }

  const { options } = parseFlexibleFlagArgs(args, new Set(["json"]));
  return bookingAvailabilityExceptionInputSchema.parse({
    contactId: options["contact-id"],
    kind: options.kind,
    startAt: options.start,
    endAt: options.end,
    reason: options.reason,
    notes: options.notes,
  });
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function parseCsvEntries(filePath: string, keyColumn: string, valueColumn?: string): Array<{ key: string; value: JsonObject }> {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    throw new Error("CSV file must contain a header row and at least one data row");
  }

  const headers = parseCsvLine(lines[0]);
  const keyIndex = headers.indexOf(keyColumn);
  if (keyIndex === -1) {
    throw new Error(`CSV key column not found: ${keyColumn}`);
  }

  const valueIndex = valueColumn ? headers.indexOf(valueColumn) : -1;
  if (valueColumn && valueIndex === -1) {
    throw new Error(`CSV value column not found: ${valueColumn}`);
  }

  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const key = cells[keyIndex];
    if (!key) {
      throw new Error("CSV row is missing a key value");
    }

    if (valueColumn && valueIndex >= 0) {
      return {
        key,
        value: {
          value: cells[valueIndex] ?? "",
        },
      };
    }

    const value = headers.reduce<Record<string, string>>((accumulator, header, index) => {
      if (index === keyIndex) {
        return accumulator;
      }

      accumulator[header] = cells[index] ?? "";
      return accumulator;
    }, {});

    return { key, value };
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const positionalArgs = args.filter((arg) => arg !== "--in-docker" && arg !== "--verbose");
  const [rawCommand, subcommand, ...rest] = positionalArgs;
  const command = getCanonicalScope(rawCommand) ?? rawCommand;

  if (!command) {
    printTopLevelHelp(args);
    return;
  }

  if (command === "help" || command === "--help") {
    if (subcommand) {
      printScopeHelp(subcommand, args);
    } else {
      printTopLevelHelp(args);
    }
    return;
  }

  initializeDatabase();

  if (command === "serve") {
    const app = createApp();
    app.listen(config.PORT, () => {
      logger.info("Business API server started from CLI", {
        port: config.PORT,
        url: `http://localhost:${config.PORT}`,
      });
    });
    return;
  }

  if (command === "db" && (subcommand === "init" || subcommand === "migrate")) {
    printJson({
      ok: true,
      ...initializeDatabase(),
      databasePath: config.databasePath,
    });
    return;
  }

  if (command === "company-card" && subcommand === "get") {
    printJson(getCompanyCard());
    return;
  }

  if (command === "company-card" && subcommand === "set") {
    const input = companyCardInputSchema.parse(parseJsonArg(rest[0], "company-card"));
    printJson(upsertCompanyCard(input));
    return;
  }

  if (command === "bank-accounts" && subcommand === "create") {
    const input = bankAccountInputSchema.parse(parseJsonArg(rest[0], "bank account"));
    printJson(createBankAccount(input));
    return;
  }

  if (command === "bank-accounts" && subcommand === "get") {
    printJson(getBankAccount(rest[0]));
    return;
  }

  if (command === "bank-accounts" && subcommand === "list") {
    const { options } = parseFlexibleFlagArgs(rest, new Set(["json"]));
    printJson(listBankAccounts({ status: options.status }));
    return;
  }

  if (command === "bank-accounts" && subcommand === "update") {
    const input = bankAccountPatchSchema.parse(parseJsonArg(rest[1], "bank account patch"));
    printJson(updateBankAccount(rest[0], input));
    return;
  }

  if (command === "bank-transactions" && subcommand === "create") {
    const input = bankTransactionInputSchema.parse(parseJsonArg(rest[0], "bank transaction"));
    printJson(createBankTransaction(input));
    return;
  }

  if (command === "bank-transactions" && subcommand === "upsert") {
    const input = bankTransactionUpsertSchema.parse(parseJsonArg(rest[0], "bank transaction"));
    printJson(upsertBankTransaction(input));
    return;
  }

  if (command === "bank-transactions" && subcommand === "get") {
    printJson(getBankTransaction(rest[0]));
    return;
  }

  if (command === "bank-transactions" && subcommand === "list") {
    const { options } = parseFlexibleFlagArgs(rest, new Set(["json"]));
    printJson(
      await listBankTransactions({
        ...parseCliListFilters(
          Object.entries({
            since: options.since,
            before: options.before,
            after: options.after,
            limit: options.limit,
          }).flatMap(([key, value]) => (value ? [`--${key}`, value] : [])),
        ),
        bankAccountId: options["bank-account-id"],
        status: options.status,
        kind: options.kind,
      }),
    );
    return;
  }

  if (command === "bank-transactions" && subcommand === "update") {
    const input = bankTransactionPatchSchema.parse(parseJsonArg(rest[1], "bank transaction patch"));
    printJson(updateBankTransaction(rest[0], input));
    return;
  }

  if (command === "bank-transactions" && subcommand === "match") {
    printJson(matchBankTransaction(rest[0]));
    return;
  }

  if (command === "bank-balances" && subcommand === "record") {
    const input = bankBalanceSnapshotInputSchema.parse(parseJsonArg(rest[0], "bank balance snapshot"));
    printJson(createBankBalanceSnapshot(input));
    return;
  }

  if (command === "bank-balances" && subcommand === "list") {
    const { options } = parseFlexibleFlagArgs(rest, new Set(["json"]));
    printJson(
      listBankBalanceSnapshots({
        ...parseCliListFilters(
          Object.entries({
            since: options.since,
            before: options.before,
            after: options.after,
            limit: options.limit,
          }).flatMap(([key, value]) => (value ? [`--${key}`, value] : [])),
        ),
        bankAccountId: options["bank-account-id"],
      }),
    );
    return;
  }

  if (command === "bank-imports" && subcommand === "csv") {
    const bankAccountId = rest[0];
    const filePath = rest[1];
    const options = bankCsvImportOptionsSchema.parse(parseJsonArg(rest[2], "bank CSV import options"));
    if (!bankAccountId || !filePath) {
      throw new Error("Usage: bank-imports csv <bank-account-id> <file-path> <json-options>");
    }

    const fileBuffer = fs.readFileSync(filePath);
    const document = uploadDocument(
      {
        fieldname: "file",
        originalname: path.basename(filePath) || "bank.csv",
        encoding: "7bit",
        mimetype: "text/csv",
        size: fileBuffer.length,
        buffer: fileBuffer,
        stream: undefined as never,
        destination: "",
        filename: "",
        path: "",
      },
      {
        kind: "bank_csv",
        source: options.source,
      },
    );
    const rows = parseBankCsvRows(fileBuffer.toString("utf8"), options);
    printJson(importBankTransactionsFromRows(bankAccountId, rows, { source: options.source, documentId: document.documentId }));
    return;
  }

  if (command === "bookings" && subcommand === "create") {
    printJson(createBooking(parseBookingInputArg(rest)));
    return;
  }

  if (command === "bookings" && subcommand === "get") {
    printJson(getBooking(rest[0]));
    return;
  }

  if (command === "bookings" && subcommand === "list") {
    printJson(listBookings(parseBookingListFilters(rest)));
    return;
  }

  if (command === "bookings" && subcommand === "update") {
    const input = bookingPatchSchema.parse(parseJsonArg(rest[1], "booking patch"));
    printJson(updateBooking(rest[0], input));
    return;
  }

  if (command === "bookings" && subcommand === "complete") {
    const input = rest[1]?.trim().startsWith("{")
      ? bookingCompleteSchema.parse(parseJsonArg(rest[1], "booking completion"))
      : bookingCompleteSchema.parse({
          completionNotes: parseFlexibleFlagArgs(rest.slice(1), new Set(["create-follow-up-task", "json"])).options["completion-notes"],
          createFollowUpTask: parseFlexibleFlagArgs(rest.slice(1), new Set(["create-follow-up-task", "json"])).booleans.has("create-follow-up-task"),
          followUpTaskTitle: parseFlexibleFlagArgs(rest.slice(1), new Set(["create-follow-up-task", "json"])).options["follow-up-task-title"],
        });
    printJson(completeBooking(rest[0], input));
    return;
  }

  if (command === "bookings" && subcommand === "cancel") {
    const input = rest[1]?.trim().startsWith("{")
      ? bookingCancelSchema.parse(parseJsonArg(rest[1], "booking cancellation"))
      : bookingCancelSchema.parse({ reason: parseFlexibleFlagArgs(rest.slice(1), new Set(["json"])).options.reason });
    printJson(cancelBooking(rest[0], input));
    return;
  }

  if (command === "bookings" && subcommand === "delete") {
    softDeleteBooking(rest[0]);
    printJson({ ok: true });
    return;
  }

  if (command === "bookings" && subcommand === "check-assignment-conflicts") {
    printJson({ conflicts: checkBookingAssignmentConflicts(parseBookingConflictCheckArg(rest)) });
    return;
  }

  if (command === "booking-assignment-profiles" && subcommand === "list") {
    printJson(listBookingAssignmentProfiles());
    return;
  }

  if (command === "booking-assignment-profiles" && subcommand === "get") {
    printJson(getBookingAssignmentProfile(rest[0]));
    return;
  }

  if (command === "booking-assignment-profiles" && subcommand === "set") {
    printJson(upsertBookingAssignmentProfile(rest[0], parseBookingAssignmentProfileArg(rest.slice(1))));
    return;
  }

  if (command === "booking-assignment-profiles" && subcommand === "delete") {
    softDeleteBookingAssignmentProfile(rest[0]);
    printJson({ ok: true });
    return;
  }

  if (command === "booking-availability-exceptions" && subcommand === "create") {
    printJson(createBookingAvailabilityException(parseBookingAvailabilityExceptionArg(rest)));
    return;
  }

  if (command === "booking-availability-exceptions" && subcommand === "list") {
    const { options } = parseFlexibleFlagArgs(rest, new Set(["json"]));
    printJson(listBookingAvailabilityExceptions({ contactId: options["contact-id"], kind: options.kind }));
    return;
  }

  if (command === "booking-availability-exceptions" && subcommand === "get") {
    printJson(getBookingAvailabilityException(rest[0]));
    return;
  }

  if (command === "booking-availability-exceptions" && subcommand === "update") {
    const input = bookingAvailabilityExceptionPatchSchema.parse(parseJsonArg(rest[1], "booking availability exception patch"));
    printJson(updateBookingAvailabilityException(rest[0], input));
    return;
  }

  if (command === "booking-availability-exceptions" && subcommand === "delete") {
    softDeleteBookingAvailabilityException(rest[0]);
    printJson({ ok: true });
    return;
  }

  if (command === "comments" && subcommand === "create") {
    const input = commentInputSchema.parse(parseJsonArg(rest[0], "comment"));
    printJson(createComment(input));
    return;
  }

  if (command === "comments" && subcommand === "get") {
    printJson(getComment(rest[0]));
    return;
  }

  if (command === "comments" && subcommand === "list") {
    printJson(listComments(parseCommentListFilters(rest)));
    return;
  }

  if (command === "comments" && subcommand === "update") {
    const input = commentPatchSchema.parse(parseJsonArg(rest[1], "comment patch"));
    printJson(updateComment(rest[0], input));
    return;
  }

  if (command === "contacts" && subcommand === "list") {
    printJson(listContacts());
    return;
  }

  if (command === "contacts" && subcommand === "create") {
    const input = contactInputSchema.parse(parseJsonArg(rest[0], "contact"));
    printJson(createContact(input));
    return;
  }

  if (command === "contacts" && subcommand === "get") {
    printJson(getContact(rest[0]));
    return;
  }

  if (command === "contacts" && subcommand === "resolve") {
    const input = contactResolveInputSchema.parse(parseJsonArg(rest[0], "contact resolve payload"));
    printJson(resolveContact(input));
    return;
  }

  if (command === "data-cache" && subcommand === "list") {
    printJson(listCaches());
    return;
  }

  if (command === "data-cache" && subcommand === "create") {
    const slug = rest[0];
    if (!slug) {
      throw new Error("Missing cache slug");
    }

    const { options } = parseFlagArgs(rest.slice(1));
    const input = dataCacheInputSchema.parse({
      slug,
      displayName: options.name,
      description: options.description,
      keyType: options["key-type"],
      valueSchema: options["value-schema"] ? parseJsonArg(options["value-schema"], "data-cache value schema") : undefined,
      fetcherConfig: options["fetcher-config"] ? parseJsonArg(options["fetcher-config"], "data-cache fetcher config") : undefined,
      defaultTtlDays: options["ttl-days"] ? Number(options["ttl-days"]) : undefined,
    });
    printJson(createCache(input));
    return;
  }

  if (command === "data-cache" && subcommand === "get") {
    printJson(getCache(rest[0]));
    return;
  }

  if (command === "data-cache" && subcommand === "lookup") {
    const slug = rest[0];
    const key = rest[1];
    if (!slug || !key) {
      throw new Error("Usage: data-cache lookup <slug> <key> --strategy <strategy>");
    }

    const { options } = parseFlagArgs(rest.slice(2));
    const input = dataCacheLookupSchema.parse({
      key,
      strategy: options.strategy,
      maxStalenessWindow: options["max-staleness-days"] ? Number(options["max-staleness-days"]) : undefined,
      fetchTimeoutMs: options["fetch-timeout-ms"] ? Number(options["fetch-timeout-ms"]) : undefined,
    });
    printJson(await lookupDataCache(slug, input.key, input));
    return;
  }

  if (command === "data-cache" && subcommand === "upsert") {
    const slug = rest[0];
    const key = rest[1];
    if (!slug || !key) {
      throw new Error("Usage: data-cache upsert <slug> <key> --value <json>");
    }

    const { options } = parseFlagArgs(rest.slice(2));
    const input = dataCacheEntryUpsertSchema.parse({
      key,
      value: parseJsonArg(options.value, "data-cache entry value"),
      expiresAt: options["expires-at"],
    });
    printJson(upsertDataCacheEntry(slug, input.key, input.value, "manual", input.expiresAt));
    return;
  }

  if (command === "data-cache" && subcommand === "import") {
    const slug = rest[0];
    if (!slug) {
      throw new Error("Usage: data-cache import <slug> --file <path>");
    }

    const { options } = parseFlagArgs(rest.slice(1));
    const filePath = options.file;
    if (!filePath) {
      throw new Error("Missing --file option");
    }

    const ext = path.extname(filePath).toLowerCase();
    let entries: Array<{ key: string; value: JsonObject; expiresAt?: string }>;

    if (ext === ".json") {
      const parsed = parseJsonArg(fs.readFileSync(filePath, "utf8"), "data-cache import file");
      entries = Array.isArray(parsed) ? dataCacheBulkImportSchema.parse({ entries: parsed }).entries : dataCacheBulkImportSchema.parse(parsed).entries;
    } else if (ext === ".csv") {
      if (!options["key-col"]) {
        throw new Error("CSV imports require --key-col");
      }

      entries = parseCsvEntries(filePath, options["key-col"], options["value-col"]);
    } else {
      throw new Error(`Unsupported import file type: ${ext || "unknown"}`);
    }

    printJson(bulkImportDataCacheEntries(slug, entries));
    return;
  }

  if (command === "documents" && subcommand === "upload") {
    const filePath = rest[0];
    const meta = documentUploadSchema.parse(parseJsonArg(rest[1], "document metadata"));
    if (!filePath) {
      throw new Error("Missing file path");
    }

    const fileBuffer = fs.readFileSync(filePath);
    const created = uploadDocument(
      {
        fieldname: "file",
        originalname: filePath.split("/").pop() ?? "upload.bin",
        encoding: "7bit",
        mimetype: "application/octet-stream",
        size: fileBuffer.length,
        buffer: fileBuffer,
        stream: undefined as never,
        destination: "",
        filename: "",
        path: "",
      },
      meta,
    );
    printJson(created);
    return;
  }

  if (command === "documents" && subcommand === "ingest") {
    const requestedFilePath = rest[0];
    const meta = documentIngestSchema.parse(parseJsonArg(rest[1], "document ingestion metadata"));
    if (!requestedFilePath) {
      throw new Error("Missing file path");
    }

    const filePath = resolveDocumentCliInputPath(requestedFilePath);
    const fileBuffer = fs.readFileSync(filePath);
    const created = await ingestDocument(
      {
        fieldname: "file",
        originalname: path.basename(filePath) || "upload.bin",
        encoding: "7bit",
        mimetype: filePath.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/png",
        size: fileBuffer.length,
        buffer: fileBuffer,
        stream: undefined as never,
        destination: "",
        filename: "",
        path: "",
      },
      meta,
    );
    const formatted = formatDocumentIngestCliOutput(created);
    if (formatted) {
      process.stdout.write(`${formatted}\n`);
    } else {
      printJson(created);
    }
    return;
  }

  if (command === "documents" && subcommand === "get") {
    printJson(getDocumentMeta(rest[0]));
    return;
  }

  if (command === "documents" && subcommand === "list") {
    printJson(await listDocuments(parseCliListFilters(rest)));
    return;
  }

  if (command === "documents" && subcommand === "download") {
    const document = getDocumentDownload(rest[0]);
    const outputPath = rest[1];
    if (!outputPath) {
      throw new Error("Missing output path");
    }

    fs.copyFileSync(document.path, outputPath);
    printJson({ ok: true, outputPath, filename: document.filename });
    return;
  }

  if (command === "expenses" && subcommand === "create") {
    const input = expenseInputSchema.parse(parseJsonArg(rest[0], "expense"));
    printJson(createExpense(input));
    return;
  }

  if (command === "expenses" && subcommand === "get") {
    printJson(getExpense(rest[0]));
    return;
  }

  if (command === "expenses" && subcommand === "list") {
    const filters = parseExpenseListCliFilters(rest);
    if (!filters.includePayrolls) {
      printJson(await listExpenses(filters));
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

    printJson(mergeExpenseAndPayrollListItems(expenses, payrolls));
    return;
  }

  if (command === "expenses" && subcommand === "update") {
    const input = expensePatchSchema.parse(parseJsonArg(rest[1], "expense patch"));
    printJson(updateExpense(rest[0], input));
    return;
  }

  if (command === "payrolls" && subcommand === "create") {
    const input = payrollInputSchema.parse(parseJsonArg(rest[0], "payroll"));
    printJson(createPayroll(input));
    return;
  }

  if (command === "payrolls" && subcommand === "get") {
    printJson(getPayroll(rest[0]));
    return;
  }

  if (command === "payrolls" && subcommand === "list") {
    printJson(await listPayrolls(parseCliListFilters(rest)));
    return;
  }

  if (command === "payrolls" && subcommand === "update") {
    const input = payrollPatchSchema.parse(parseJsonArg(rest[1], "payroll patch"));
    printJson(updatePayroll(rest[0], input));
    return;
  }

  if (command === "deals" && subcommand === "create") {
    const input = dealInputSchema.parse(parseJsonArg(rest[0], "deal"));
    printJson(createDeal(input));
    return;
  }

  if (command === "deals" && subcommand === "get") {
    printJson(getDeal(rest[0]));
    return;
  }

  if (command === "deals" && subcommand === "list") {
    printJson(listDeals());
    return;
  }

  if (command === "sales-invoices" && subcommand === "generate") {
    const input = salesInvoiceGenerateSchema.parse(parseJsonArg(rest[0], "sales invoice"));
    printJson(generateSalesInvoice(input));
    return;
  }

  if (command === "sales-invoices" && subcommand === "get") {
    printJson(getSalesInvoice(rest[0]));
    return;
  }

  if (command === "sales-invoices" && subcommand === "list") {
    printJson(await listSalesInvoices(parseCliListFilters(rest)));
    return;
  }

  if (command === "sales-invoices" && subcommand === "update") {
    const input = salesInvoicePatchSchema.parse(parseJsonArg(rest[1], "sales invoice patch"));
    printJson(updateSalesInvoice(rest[0], input));
    return;
  }

  if (command === "projects" && subcommand === "create") {
    const input = projectInputSchema.parse(parseJsonArg(rest[0], "project"));
    printJson(createProject(input));
    return;
  }

  if (command === "projects" && subcommand === "get") {
    printJson(getProject(rest[0]));
    return;
  }

  if (command === "projects" && subcommand === "list") {
    printJson(listProjects());
    return;
  }

  if (command === "tasks" && subcommand === "create") {
    const input = taskInputSchema.parse(parseJsonArg(rest[0], "task"));
    printJson(createTask(input));
    return;
  }

  if (command === "tasks" && subcommand === "get") {
    printJson(getTask(rest[0]));
    return;
  }

  if (command === "tasks" && subcommand === "list") {
    printJson(listTasks());
    return;
  }

  if (command === "tasks" && subcommand === "update") {
    const input = taskPatchSchema.parse(parseJsonArg(rest[1], "task patch"));
    printJson(updateTask(rest[0], input));
    return;
  }

  throw new Error(`Unknown command: ${positionalArgs.join(" ")}`);
}

main().catch((error) => {
  const positionalArgs = process.argv
    .slice(2)
    .filter((arg) => arg !== "--in-docker" && arg !== "--verbose");
  const command = positionalArgs.join(" ");

  if (isWrapperCliInvocation()) {
    process.stderr.write(`${formatCliErrorAsMarkdown(command, error)}\n`);
  } else {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Business API CLI command failed", {
      command,
      error,
    });
    process.stderr.write(`${message}\n`);
  }

  process.exitCode = 1;
});
