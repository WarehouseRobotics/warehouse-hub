import { getWorkspace, updateWorkspace } from "../../services/workspaces.js";
import {
  mapCliPublicWorkspace,
  requireCliRole,
  requireCliScope,
  resolveCliAuth,
  splitCliCredentialOption,
} from "../auth-session.js";
import {
  parseFlexibleFlagArgs,
  throwUnknownCommand,
  type CliCommandDefinition,
} from "../core.js";

function credentialArgsFromRest(rest: string[]): {
  credentialArgs: string[];
  rest: string[];
} {
  const credentialSplit = splitCliCredentialOption(rest);
  return {
    credentialArgs: credentialSplit.token
      ? ["--token", credentialSplit.token]
      : [],
    rest: credentialSplit.rest,
  };
}

export const commandDefinitions: CliCommandDefinition[] = [
  {
    scope: "workspace",
    help: {
      description: "Inspect and update the singleton workspace.",
      commands: [
        "get [--token <token>]",
        "set [--name <name>] [--slug <slug>] [--token <token>]",
      ],
      examples: [
        "workspace get --json",
        'workspace set --name "Northwind Robotics"',
        "workspace set --slug northwind-robotics",
      ],
    },
    async handler({ subcommand, rest, positionalArgs, context }) {
      const split = credentialArgsFromRest(rest);

      if (subcommand === "get") {
        const auth = resolveCliAuth(split.credentialArgs);
        requireCliScope(auth, "read");
        context.printJson(mapCliPublicWorkspace(getWorkspace()));
        return;
      }

      if (subcommand === "set") {
        const { options } = parseFlexibleFlagArgs(
          split.rest,
          new Set(["json"]),
        );
        const name = options.name?.trim();
        const slug = options.slug?.trim();
        if (!name && !slug) {
          throw new Error("At least one of --name or --slug must be provided");
        }

        const auth = resolveCliAuth(split.credentialArgs);
        requireCliScope(auth, "write");
        requireCliRole(auth, "admin");

        context.printJson(
          mapCliPublicWorkspace(
            updateWorkspace({
              ...(name ? { name } : {}),
              ...(slug ? { slug } : {}),
            }),
          ),
        );
        return;
      }

      throwUnknownCommand(positionalArgs);
    },
  },
];
