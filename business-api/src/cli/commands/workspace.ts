import { getWorkspace, updateWorkspace } from "../../services/workspaces.js";
import { mapCliPublicWorkspace } from "../auth-session.js";
import {
  parseFlexibleFlagArgs,
  throwUnknownCommand,
  type CliCommandDefinition,
} from "../core.js";

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
      if (subcommand === "get") {
        context.printJson(mapCliPublicWorkspace(getWorkspace()));
        return;
      }

      if (subcommand === "set") {
        const { options } = parseFlexibleFlagArgs(
          rest,
          new Set(["json"]),
        );
        const name = options.name?.trim();
        const slug = options.slug?.trim();
        if (!name && !slug) {
          throw new Error("At least one of --name or --slug must be provided");
        }

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
