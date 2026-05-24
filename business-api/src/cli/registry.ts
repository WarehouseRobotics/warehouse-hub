import { commandDefinitions as authCommandDefinitions } from "./commands/auth.js";
import { commandDefinitions as accountingCommandDefinitions } from "./commands/accounting.js";
import { commandDefinitions as bankCommandDefinitions } from "./commands/bank.js";
import { commandDefinitions as bookingCommandDefinitions } from "./commands/bookings.js";
import { commandDefinitions as coreCommandDefinitions } from "./commands/core.js";
import { commandDefinitions as crmCommandDefinitions } from "./commands/crm.js";
import { commandDefinitions as dataCacheCommandDefinitions } from "./commands/data-cache.js";
import { commandDefinitions as documentCommandDefinitions } from "./commands/documents.js";
import { commandDefinitions as taxReportCommandDefinitions } from "./commands/tax-reports.js";
import { commandDefinitions as tokenCommandDefinitions } from "./commands/tokens.js";
import { commandDefinitions as userCommandDefinitions } from "./commands/users.js";
import { commandDefinitions as workspaceCommandDefinitions } from "./commands/workspace.js";
import {
  throwUnknownCommand,
  type CliAuthRequirement,
  type CliCommandDefinition,
  type CliContext,
} from "./core.js";
import {
  requireCliRole,
  requireCliScope,
  resolveCliAuthFromCredential,
  splitCliCredentialOption,
} from "./auth-session.js";
import { AppError } from "../lib/errors.js";

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
  "tax-reports",
  "tax-report-payment-links",
  "tax-carryforwards",
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
  ...taxReportCommandDefinitions,
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

const readSubcommands = new Set(["get", "list", "download"]);
const writeSubcommands = new Set([
  "cancel",
  "check-assignment-conflicts",
  "complete",
  "create",
  "csv",
  "delete",
  "generate",
  "import",
  "ingest",
  "invite",
  "lookup",
  "match",
  "record",
  "resolve",
  "revoke",
  "revoke-invite",
  "set",
  "set-role",
  "attach-receipt",
  "suggest-payments",
  "update",
  "upload",
  "upsert",
]);
const userSubcommands = new Set([
  "delete",
  "invite",
  "list",
  "revoke-invite",
  "set-role",
]);
const tokenSubcommands = new Set(["create", "list", "revoke"]);
const workspaceSubcommands = new Set(["get", "set"]);

function inferAuthRequirement(
  scope: string,
  subcommand: string | undefined,
): CliAuthRequirement | false {
  if (!subcommand) {
    return false;
  }

  if (scope === "auth") {
    return subcommand === "whoami" ? { scope: "read" } : false;
  }

  if (scope === "users") {
    if (!userSubcommands.has(subcommand)) {
      return false;
    }

    return {
      scope: subcommand === "list" ? "read" : "write",
      role: "admin",
      userRequired: true,
    };
  }

  if (scope === "tokens") {
    if (!tokenSubcommands.has(subcommand)) {
      return false;
    }

    return {
      scope: subcommand === "list" ? "read" : "write",
      userRequired: true,
    };
  }

  if (scope === "workspace") {
    if (!workspaceSubcommands.has(subcommand)) {
      return false;
    }

    return subcommand === "get"
      ? { scope: "read" }
      : { scope: "write", role: "admin" };
  }

  if (readSubcommands.has(subcommand)) {
    return { scope: "read" };
  }

  if (writeSubcommands.has(subcommand)) {
    return { scope: "write" };
  }

  return false;
}

function resolveAuthRequirement(
  definition: CliCommandDefinition,
  args: {
    rawCommand: string | undefined;
    subcommand: string | undefined;
    rest: string[];
    positionalArgs: string[];
  },
): CliAuthRequirement | false {
  if (typeof definition.auth === "function") {
    return (
      definition.auth({
        rawCommand: args.rawCommand,
        subcommand: args.subcommand,
        rest: args.rest,
        positionalArgs: args.positionalArgs,
      }) ?? false
    );
  }

  if (definition.auth !== undefined) {
    return definition.auth;
  }

  return inferAuthRequirement(definition.scope, args.subcommand);
}

function enforceAuthRequirement(
  auth: CliContext["auth"],
  requirement: CliAuthRequirement,
): void {
  if (!auth) {
    throw new AppError("CLI authentication is required", {
      statusCode: 401,
      code: "unauthorized",
    });
  }

  requireCliScope(auth, requirement.scope);

  if (requirement.role) {
    requireCliRole(auth, requirement.role);
  }

  if (requirement.userRequired && !auth.userId) {
    throw new AppError("Current-user routes require user auth", {
      statusCode: 403,
      code: "forbidden",
    });
  }
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

  const credentialSplit = splitCliCredentialOption(args.rest);
  const authRequirement = resolveAuthRequirement(definition, {
    rawCommand: args.rawCommand,
    subcommand: args.subcommand,
    rest: credentialSplit.rest,
    positionalArgs: args.positionalArgs,
  });
  const auth = authRequirement
    ? resolveCliAuthFromCredential(credentialSplit.token)
    : undefined;

  if (authRequirement) {
    enforceAuthRequirement(auth, authRequirement);
  }

  await definition.handler({
    subcommand: args.subcommand,
    rest: credentialSplit.rest,
    rawArgs: args.rawArgs,
    positionalArgs: args.positionalArgs,
    context: {
      ...args.context,
      auth,
    },
  });
}
