import { config } from "./config.js";
import { initializeDatabase } from "./db/connection.js";
import { createApp } from "./app.js";
import { getCompanyCard, upsertCompanyCard } from "./services/company-card.js";
import { createContact, listContacts } from "./services/contacts.js";
import { companyCardInputSchema } from "./schemas/company-card.js";
import { contactInputSchema } from "./schemas/contact.js";

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

  throw new Error(`Unknown command: ${args.join(" ")}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
