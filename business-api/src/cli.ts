import fs from "node:fs";

import { config } from "./config.js";
import { initializeDatabase } from "./db/connection.js";
import { createApp } from "./app.js";
import { getCompanyCard, upsertCompanyCard } from "./services/company-card.js";
import { createContact, getContact, listContacts, resolveContact } from "./services/contacts.js";
import { createDeal, getDeal, listDeals } from "./services/deals.js";
import { getDocumentDownload, getDocumentMeta, listDocuments, uploadDocument } from "./services/documents.js";
import { ingestDocument } from "./services/document-ingestion.js";
import { createExpense, getExpense, listExpenses, updateExpense } from "./services/expenses.js";
import { createProject, getProject, listProjects } from "./services/projects.js";
import { generateSalesInvoice, getSalesInvoice, listSalesInvoices, updateSalesInvoice } from "./services/sales-invoices.js";
import { createTask, getTask, listTasks, updateTask } from "./services/tasks.js";
import {
  companyCardInputSchema,
  contactInputSchema,
  contactResolveInputSchema,
  dealInputSchema,
  documentIngestSchema,
  documentUploadSchema,
  expenseInputSchema,
  expensePatchSchema,
  projectInputSchema,
  salesInvoiceGenerateSchema,
  salesInvoicePatchSchema,
  taskInputSchema,
  taskPatchSchema,
} from "@warehouse-hub/business-schemas";
import { parseCliListFilters } from "./lib/list-filters.js";
import { logger } from "./lib/logger.js";

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
  contacts: {
    description: "Create, inspect, list, or resolve contacts.",
    commands: ["list", "create <json>", "get <id-or-slug>", "resolve <json>"],
    examples: [
      "contacts list",
      'contacts create \'{"type":"company","status":"active","roles":["customer"],"displayName":"Acme Retail GmbH"}\'',
      'contacts resolve \'{"autoCreate":true,"matchBy":["taxId","email"],"contact":{"type":"company","displayName":"Acme Retail GmbH"}}\'',
    ],
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
      "documents list --after 2026-04-01 --before 2026-05-01",
    ],
  },
  expenses: {
    description: "Manage expense invoices and supplier bills.",
    commands: [
      "create <json>",
      "get <id-or-slug>",
      "list [--similar <text>] [--limit <n>] [--since <duration>] [--before <date>] [--after <date>]",
      "update <id-or-slug> <json>",
    ],
    examples: [
      'expenses create \'{"supplierContactId":"ct_000245","invoiceNumber":"FC-2026-0042","invoiceDate":"2026-03-25","currency":"EUR"}\'',
      "expenses list --status recorded",
      'expenses list --similar "office toner cartridges from papeleria centro" --since 2m',
    ],
    aliases: ["purchase-invoices", "expense-invoices", "bills"],
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

const TOP_LEVEL_COMMANDS = [
  "help [scope]",
  "serve",
  "db <subcommand>",
  "company-card <subcommand>",
  "contacts <subcommand>",
  "documents <subcommand>",
  "expenses <subcommand>",
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

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const positionalArgs = args.filter((arg) => arg !== "--in-docker");
  const [rawCommand, subcommand, ...rest] = positionalArgs;
  const command = getCanonicalScope(rawCommand) ?? rawCommand;

  if (!command) {
    printTopLevelHelp(args);
    return;
  }

  if (command === "help") {
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
    const filePath = rest[0];
    const meta = documentIngestSchema.parse(parseJsonArg(rest[1], "document ingestion metadata"));
    if (!filePath) {
      throw new Error("Missing file path");
    }

    const fileBuffer = fs.readFileSync(filePath);
    const created = await ingestDocument(
      {
        fieldname: "file",
        originalname: filePath.split("/").pop() ?? "upload.bin",
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
    printJson(created);
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
    printJson(await listExpenses(parseCliListFilters(rest)));
    return;
  }

  if (command === "expenses" && subcommand === "update") {
    const input = expensePatchSchema.parse(parseJsonArg(rest[1], "expense patch"));
    printJson(updateExpense(rest[0], input));
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
  const message = error instanceof Error ? error.message : String(error);
  const positionalArgs = process.argv.slice(2).filter((arg) => arg !== "--in-docker");
  logger.error("Business API CLI command failed", {
    command: positionalArgs.join(" "),
    error,
  });
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
