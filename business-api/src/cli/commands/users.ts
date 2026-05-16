import { AppError } from "../../lib/errors.js";
import {
  createInvitation,
  revokeInvitation,
} from "../../services/user-invitations.js";
import { listUsers, softDeleteUser, updateUser } from "../../services/users.js";
import {
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

const invitationRoles = new Set(["admin", "member"]);
const userRoles = new Set(["owner", "admin", "member"]);

function requireCurrentCliUserId(rest: string[], write = false): string {
  const auth = resolveCliAuth(rest);
  requireCliRole(auth, "admin");
  requireCliScope(auth, write ? "write" : "read");

  if (!auth.userId) {
    throw new AppError("Current-user routes require user auth", {
      statusCode: 403,
      code: "forbidden",
    });
  }

  return auth.userId;
}

function requireOption(
  options: Record<string, string>,
  key: string,
): string {
  const value = options[key];
  if (!value) {
    throw new Error(`Missing required option: --${key}`);
  }

  return value;
}

export const commandDefinitions: CliCommandDefinition[] = [
  {
    scope: "users",
    aliases: ["user"],
    help: {
      description: "Manage workspace users and invitations.",
      commands: [
        "list [--token <token>]",
        "invite --email <email> --role <admin|member> [--token <token>]",
        "revoke-invite <invitationId> [--token <token>]",
        "set-role <userId> --role <owner|admin|member> [--token <token>]",
        "delete <userId> [--token <token>]",
      ],
      examples: [
        "users list --json",
        "users invite --email teammate@example.com --role member",
        "users revoke-invite inv_000000000000",
        "users set-role usr_000000000000 --role admin",
        "users delete usr_000000000000",
      ],
    },
    async handler({ subcommand, rest, positionalArgs, context }) {
      const credentialSplit = splitCliCredentialOption(rest);
      const credentialArgs = credentialSplit.token
        ? ["--token", credentialSplit.token]
        : [];

      if (subcommand === "list") {
        requireCurrentCliUserId(credentialArgs, false);
        context.printJson(listUsers());
        return;
      }

      if (subcommand === "invite") {
        const { options } = parseFlexibleFlagArgs(
          credentialSplit.rest,
          new Set(["json"]),
        );
        const email = requireOption(options, "email");
        const role = requireOption(options, "role");
        if (!invitationRoles.has(role)) {
          throw new Error("Invitation role must be admin or member");
        }

        const invitedByUserId = requireCurrentCliUserId(credentialArgs, true);
        context.printJson(
          await createInvitation({
            email,
            role: role as "admin" | "member",
            invitedByUserId,
          }),
        );
        return;
      }

      if (subcommand === "revoke-invite") {
        requireCurrentCliUserId(credentialArgs, true);
        const invitationId = credentialSplit.rest[0];
        if (!invitationId) {
          throw new Error("Missing invitation ID");
        }

        context.printJson(revokeInvitation(invitationId));
        return;
      }

      if (subcommand === "set-role") {
        const { positionals, options } = parseFlexibleFlagArgs(
          credentialSplit.rest,
          new Set(["json"]),
        );
        const userId = positionals[0];
        if (!userId) {
          throw new Error("Missing user ID");
        }

        const role = requireOption(options, "role");
        if (!userRoles.has(role)) {
          throw new Error("User role must be owner, admin, or member");
        }

        requireCurrentCliUserId(credentialArgs, true);
        context.printJson(
          await updateUser(userId, {
            role: role as "owner" | "admin" | "member",
          }),
        );
        return;
      }

      if (subcommand === "delete") {
        requireCurrentCliUserId(credentialArgs, true);
        const userId = credentialSplit.rest[0];
        if (!userId) {
          throw new Error("Missing user ID");
        }

        softDeleteUser(userId);
        context.printJson({ ok: true, userId });
        return;
      }

      throwUnknownCommand(positionalArgs);
    },
  },
];
