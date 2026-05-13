import { initializeDatabase } from "../db/connection.js";
import { printJson, printLines, type CliContext } from "./core.js";
import { printScopeHelp, printTopLevelHelp } from "./help.js";
import { commandDefinitions, dispatchCommand, getCanonicalScope } from "./registry.js";

export async function runCli(args: string[]): Promise<void> {
  const positionalArgs = args.filter((arg) => arg !== "--in-docker" && arg !== "--verbose");
  const [rawCommand, subcommand, ...rest] = positionalArgs;

  const context: CliContext = {
    rawArgs: args,
    printJson,
    printLines,
  };

  if (!rawCommand) {
    printTopLevelHelp(args, commandDefinitions, printLines);
    return;
  }

  if (rawCommand === "help" || rawCommand === "--help") {
    if (subcommand) {
      printScopeHelp(subcommand, args, commandDefinitions, getCanonicalScope, printLines);
    } else {
      printTopLevelHelp(args, commandDefinitions, printLines);
    }
    return;
  }

  initializeDatabase();

  await dispatchCommand({
    rawCommand,
    subcommand,
    rest,
    rawArgs: args,
    positionalArgs,
    context,
  });
}
