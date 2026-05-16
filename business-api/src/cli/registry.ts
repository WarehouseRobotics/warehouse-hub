import { commandDefinitions as authCommandDefinitions } from "./commands/auth.js";
import { commandDefinitions as accountingCommandDefinitions } from "./commands/accounting.js";
import { commandDefinitions as bankCommandDefinitions } from "./commands/bank.js";
import { commandDefinitions as bookingCommandDefinitions } from "./commands/bookings.js";
import { commandDefinitions as coreCommandDefinitions } from "./commands/core.js";
import { commandDefinitions as crmCommandDefinitions } from "./commands/crm.js";
import { commandDefinitions as dataCacheCommandDefinitions } from "./commands/data-cache.js";
import { commandDefinitions as documentCommandDefinitions } from "./commands/documents.js";
import { commandDefinitions as tokenCommandDefinitions } from "./commands/tokens.js";
import { commandDefinitions as userCommandDefinitions } from "./commands/users.js";
import { commandDefinitions as workspaceCommandDefinitions } from "./commands/workspace.js";
import { throwUnknownCommand, type CliCommandDefinition, type CliContext } from "./core.js";

const COMMAND_SCOPE_ORDER = [
  "serve",
  "db",
  "auth",
  "users",
  "tokens",
  "workspace",
  "company-card",
  "bank-accounts",
  "bank-transactions",
  "bank-balances",
  "bank-imports",
  "bookings",
  "booking-assignment-profiles",
  "booking-availability-exceptions",
  "comments",
  "contacts",
  "data-cache",
  "documents",
  "expenses",
  "payrolls",
  "deals",
  "sales-invoices",
  "projects",
  "tasks",
];

export const commandDefinitions: CliCommandDefinition[] = [
  ...coreCommandDefinitions,
  ...authCommandDefinitions,
  ...userCommandDefinitions,
  ...tokenCommandDefinitions,
  ...workspaceCommandDefinitions,
  ...bankCommandDefinitions,
  ...bookingCommandDefinitions,
  ...crmCommandDefinitions,
  ...dataCacheCommandDefinitions,
  ...documentCommandDefinitions,
  ...accountingCommandDefinitions,
].sort(
  (left, right) =>
    COMMAND_SCOPE_ORDER.indexOf(left.scope) -
    COMMAND_SCOPE_ORDER.indexOf(right.scope),
);

const commandByScope = new Map(
  commandDefinitions.map((definition) => [definition.scope, definition]),
);
const aliasToScope = new Map<string, string>();

for (const definition of commandDefinitions) {
  for (const alias of definition.aliases ?? []) {
    aliasToScope.set(alias.toLowerCase(), definition.scope);
  }
}

export function getCanonicalScope(scope: string | undefined): string | undefined {
  if (!scope) {
    return undefined;
  }

  if (commandByScope.has(scope)) {
    return scope;
  }

  return aliasToScope.get(scope.toLowerCase());
}

export async function dispatchCommand(args: {
  rawCommand: string | undefined;
  subcommand: string | undefined;
  rest: string[];
  rawArgs: string[];
  positionalArgs: string[];
  context: CliContext;
}): Promise<void> {
  const command = getCanonicalScope(args.rawCommand) ?? args.rawCommand;
  const definition = command ? commandByScope.get(command) : undefined;

  if (!definition) {
    throwUnknownCommand(args.positionalArgs);
  }

  await definition.handler({
    subcommand: args.subcommand,
    rest: args.rest,
    rawArgs: args.rawArgs,
    positionalArgs: args.positionalArgs,
    context: args.context,
  });
}
