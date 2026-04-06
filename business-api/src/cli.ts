import fs from "node:fs";

import { config } from "./config.js";
import { initializeDatabase } from "./db/connection.js";
import { createApp } from "./app.js";
import { getCompanyCard, upsertCompanyCard } from "./services/company-card.js";
import { createContact, getContact, listContacts, resolveContact } from "./services/contacts.js";
import { createDeal, getDeal, listDeals } from "./services/deals.js";
import { getDocumentDownload, getDocumentMeta, uploadDocument } from "./services/documents.js";
import { createExpense, getExpense, listExpenses, updateExpense } from "./services/expenses.js";
import { createProject, getProject, listProjects } from "./services/projects.js";
import { generateSalesInvoice, getSalesInvoice, listSalesInvoices, updateSalesInvoice } from "./services/sales-invoices.js";
import { createTask, getTask, listTasks, updateTask } from "./services/tasks.js";
import { companyCardInputSchema } from "./schemas/company-card.js";
import { contactInputSchema, contactResolveInputSchema } from "./schemas/contact.js";
import { dealInputSchema } from "./schemas/deal.js";
import { documentUploadSchema } from "./schemas/document.js";
import { expenseInputSchema, expensePatchSchema } from "./schemas/expense.js";
import { projectInputSchema } from "./schemas/project.js";
import { salesInvoiceGenerateSchema, salesInvoicePatchSchema } from "./schemas/sales-invoice.js";
import { taskInputSchema, taskPatchSchema } from "./schemas/task.js";

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function parseJsonArg(value: string | undefined, label: string): unknown {
  if (!value) {
    throw new Error(`Missing ${label} JSON argument`);
  }

  return JSON.parse(value);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const [command, subcommand, ...rest] = args;

  if (!command) {
    printJson({
      usage: [
        "tsx src/cli.ts serve",
        "tsx src/cli.ts db init",
        "tsx src/cli.ts company-card get",
        "tsx src/cli.ts company-card set '<json>'",
        "tsx src/cli.ts contacts list",
        "tsx src/cli.ts contacts create '<json>'",
        "tsx src/cli.ts contacts get <id-or-slug>",
        "tsx src/cli.ts contacts resolve '<json>'",
        "tsx src/cli.ts documents upload <file-path> '<json-meta>'",
        "tsx src/cli.ts documents get <id-or-slug>",
        "tsx src/cli.ts documents download <id-or-slug> <output-path>",
        "tsx src/cli.ts expenses create '<json>'",
        "tsx src/cli.ts expenses get <id-or-slug>",
        "tsx src/cli.ts expenses list",
        "tsx src/cli.ts expenses update <id-or-slug> '<json>'",
        "tsx src/cli.ts deals create '<json>'",
        "tsx src/cli.ts deals get <id-or-slug>",
        "tsx src/cli.ts deals list",
        "tsx src/cli.ts sales-invoices generate '<json>'",
        "tsx src/cli.ts sales-invoices get <id-or-slug>",
        "tsx src/cli.ts sales-invoices list",
        "tsx src/cli.ts sales-invoices update <id-or-slug> '<json>'",
        "tsx src/cli.ts projects create '<json>'",
        "tsx src/cli.ts projects get <id-or-slug>",
        "tsx src/cli.ts projects list",
        "tsx src/cli.ts tasks create '<json>'",
        "tsx src/cli.ts tasks get <id-or-slug>",
        "tsx src/cli.ts tasks list",
        "tsx src/cli.ts tasks update <id-or-slug> '<json>'",
      ],
    });
    return;
  }

  initializeDatabase();

  if (command === "serve") {
    const app = createApp();
    app.listen(config.PORT, () => {
      console.log(`Business API listening on http://localhost:${config.PORT}`);
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

  if (command === "documents" && subcommand === "get") {
    printJson(getDocumentMeta(rest[0]));
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
    printJson(listExpenses());
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
    printJson(listSalesInvoices());
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

  throw new Error(`Unknown command: ${args.join(" ")}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
