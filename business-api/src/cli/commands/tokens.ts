import { AppError } from "../../lib/errors.js";
import {
  createToken,
  listTokensForUser,
  revokeToken,
  type AuthScope,
} from "../../services/personal-access-tokens.js";
import type { PersonalAccessTokenActorType } from "../../db/schema/index.js";
import {
  requireCliScope,
  resolveCliAuth,
  splitCliCredentialOption,
} from "../auth-session.js";
import {
  parseFlexibleFlagArgs,
  throwUnknownCommand,
  type CliCommandDefinition,
} from "../core.js";

const authScopes = new Set<AuthScope>(["read", "write", "admin"]);
const actorTypes = new Set<PersonalAccessTokenActorType>(["user", "agent"]);

function requireCurrentCliUserId(rest: string[], write = false): string {
  const auth = resolveCliAuth(rest);
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
  const value = options[key]?.trim();
  if (!value) {
    throw new Error(`Missing required option: --${key}`);
  }

  return value;
}

function parseScopes(value: string): AuthScope[] {
  const scopes = value
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);

  if (
    scopes.length === 0 ||
    scopes.some((scope) => !authScopes.has(scope as AuthScope))
  ) {
    throw new Error("Token scopes must be read, write, or admin");
  }

  return scopes as AuthScope[];
}

function parseActorType(value: string): PersonalAccessTokenActorType {
  if (!actorTypes.has(value as PersonalAccessTokenActorType)) {
    throw new Error("Token actor type must be user or agent");
  }

  return value as PersonalAccessTokenActorType;
}

export const commandDefinitions: CliCommandDefinition[] = [
  {
    scope: "tokens",
    aliases: ["token"],
    help: {
      description: "Manage personal access tokens for the current user.",
      commands: [
        "create --name <name> --actor-type <user|agent> --scopes <read|write|admin> [--expires-at <iso>] [--token <token>]",
        "list [--token <token>]",
        "revoke <tokenId> [--token <token>]",
      ],
      examples: [
        "tokens create --name claude-desktop --actor-type agent --scopes write",
        "tokens list --json",
        "tokens revoke pat_000000000000",
      ],
    },
    async handler({ subcommand, rest, positionalArgs, context }) {
      const credentialSplit = splitCliCredentialOption(rest);
      const credentialArgs = credentialSplit.token
        ? ["--token", credentialSplit.token]
        : [];

      if (subcommand === "create") {
        const { options } = parseFlexibleFlagArgs(
          credentialSplit.rest,
          new Set(["json"]),
        );
        const name = requireOption(options, "name");
        const actorType = parseActorType(requireOption(options, "actor-type"));
        const scopes = parseScopes(requireOption(options, "scopes"));
        const userId = requireCurrentCliUserId(credentialArgs, true);

        context.printJson(
          createToken(userId, {
            name,
            actorType,
            scopes,
            expiresAt: options["expires-at"] ?? null,
          }),
        );
        return;
      }

      if (subcommand === "list") {
        const userId = requireCurrentCliUserId(credentialArgs, false);
        context.printJson(listTokensForUser(userId));
        return;
      }

      if (subcommand === "revoke") {
        const tokenId = credentialSplit.rest[0];
        if (!tokenId) {
          throw new Error("Missing token ID");
        }

        const userId = requireCurrentCliUserId(credentialArgs, true);
        revokeToken(tokenId, userId);
        context.printJson({ ok: true, tokenId });
        return;
      }

      throwUnknownCommand(positionalArgs);
    },
  },
];
