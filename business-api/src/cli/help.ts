import type { CliCommandDefinition } from "./core.js";

const DEFAULT_CLI_PREFIX = "./container.sh exec npm run cli -- ";
const DOCKER_WRAPPER_PREFIX = "wrobo-biz ";

function getCliPrefix(args: string[]): string {
  return args.includes("--in-docker") ? DOCKER_WRAPPER_PREFIX : DEFAULT_CLI_PREFIX;
}

function formatExample(command: string, prefix: string): string {
  return `${prefix}${command}`;
}

export function printTopLevelHelp(
  args: string[],
  definitions: CliCommandDefinition[],
  printLines: (lines: string[]) => void,
): void {
  const prefix = getCliPrefix(args);
  const helpDefinitions = definitions.filter((definition) => !definition.hiddenFromHelp);

  printLines([
    "Warehouse Hub Business API CLI",
    "",
    "Top-level commands:",
    "  - help [scope]",
    "  - serve",
    ...helpDefinitions.map((definition) => `  - ${definition.scope} <subcommand>`),
    "",
    "Scopes:",
    ...helpDefinitions.map((definition) => `  - ${definition.scope}: ${definition.help.description}`),
    "",
    "Examples:",
    `  - ${formatExample("help projects", prefix)}`,
    `  - ${formatExample("help invoices", prefix)}`,
    `  - ${formatExample("contacts list", prefix)}`,
  ]);
}

export function printScopeHelp(
  scope: string,
  args: string[],
  definitions: CliCommandDefinition[],
  getCanonicalScope: (scope: string | undefined) => string | undefined,
  printLines: (lines: string[]) => void,
): void {
  const canonicalScope = getCanonicalScope(scope);
  const helpDefinitions = definitions.filter((definition) => !definition.hiddenFromHelp);

  if (!canonicalScope) {
    const knownScopes = helpDefinitions.map((definition) => definition.scope).join(", ");
    throw new Error(`Unknown help scope: ${scope}. Known scopes: ${knownScopes}`);
  }

  const definition = helpDefinitions.find((candidate) => candidate.scope === canonicalScope);
  if (!definition) {
    const knownScopes = helpDefinitions.map((candidate) => candidate.scope).join(", ");
    throw new Error(`Unknown help scope: ${scope}. Known scopes: ${knownScopes}`);
  }

  const prefix = getCliPrefix(args);

  printLines([
    `Help for ${canonicalScope}`,
    "",
    definition.help.description,
    "",
    "Commands:",
    ...definition.help.commands.map((command) => `  - ${canonicalScope} ${command}`),
    "",
    "Examples:",
    ...definition.help.examples.map((example) => `  - ${formatExample(example, prefix)}`),
  ]);
}
