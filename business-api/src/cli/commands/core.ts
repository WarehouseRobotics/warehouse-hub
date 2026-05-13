import { config } from "../../config.js";
import { createApp } from "../../app.js";
import { initializeDatabase } from "../../db/connection.js";
import { logger } from "../../lib/logger.js";
import { getCompanyCard, upsertCompanyCard } from "../../services/company-card.js";
import { companyCardInputSchema } from "@warehouse-hub/business-schemas";
import { parseJsonArg, throwUnknownCommand, type CliCommandDefinition } from "../core.js";

export const commandDefinitions: CliCommandDefinition[] = [
  {
    scope: "serve",
    hiddenFromHelp: true,
    help: {
      description: "Start the Business API server.",
      commands: [],
      examples: [],
    },
    handler() {
      const app = createApp();
      app.listen(config.PORT, () => {
        logger.info("Business API server started from CLI", {
          port: config.PORT,
          url: `http://localhost:${config.PORT}`,
        });
      });
    },
  },
  {
    scope: "db",
    help: {
      description: "Database bootstrap and migration tasks.",
      commands: ["init", "migrate"],
      examples: ["db init", "db migrate"],
    },
    handler({ subcommand, positionalArgs, context }) {
      if (subcommand === "init" || subcommand === "migrate") {
        context.printJson({
          ok: true,
          ...initializeDatabase(),
          databasePath: config.databasePath,
        });
        return;
      }

      throwUnknownCommand(positionalArgs);
    },
  },
  {
    scope: "company-card",
    aliases: ["company"],
    help: {
      description: "Read or update the owned company profile used across business workflows.",
      commands: ["get", "set <json>"],
      examples: [
        "company-card get",
        'company-card set \'{"legalName":"Northwind Robotics SL","displayName":"Northwind Robotics"}\'',
      ],
    },
    handler({ subcommand, rest, positionalArgs, context }) {
      if (subcommand === "get") {
        context.printJson(getCompanyCard());
        return;
      }

      if (subcommand === "set") {
        const input = companyCardInputSchema.parse(parseJsonArg(rest[0], "company-card"));
        context.printJson(upsertCompanyCard(input));
        return;
      }

      throwUnknownCommand(positionalArgs);
    },
  },
];
