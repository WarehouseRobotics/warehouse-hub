import { once } from "node:events";
import { createInterface } from "node:readline/promises";

import { config } from "../../config.js";
import { AppError } from "../../lib/errors.js";
import { magicLinkLoginEmail } from "../../services/email.js";
import {
  consumeMagicLink,
  createMagicLink,
} from "../../services/magic-link-tokens.js";
import {
  createSession,
  requireActiveSession,
  revokeSession,
} from "../../services/user-sessions.js";
import {
  getUser,
  markUserLoggedIn,
  verifyUserPassword,
  type User,
} from "../../services/users.js";
import { getWorkspace } from "../../services/workspaces.js";
import {
  clearCliSession,
  mapCliPublicUser,
  mapCliPublicWorkspace,
  readCliSession,
  requireInjectedCliAuth,
  writeCliSession,
} from "../auth-session.js";
import {
  parseFlexibleFlagArgs,
  throwUnknownCommand,
  type CliCommandDefinition,
} from "../core.js";

const MAGIC_LINK_REQUEST_SINK_EMAIL =
  "magic-link-request-sink@warehouse-hub.invalid";

function isNotFoundError(error: unknown): boolean {
  return error instanceof AppError && error.statusCode === 404;
}

function throwInvalidMagicLinkToken(): never {
  throw new AppError("Magic link token is invalid or expired", {
    statusCode: 401,
    code: "invalid_magic_link_token",
  });
}

async function readPasswordFromStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    const readline = createInterface({
      input: process.stdin,
      output: process.stderr,
    });
    try {
      return await readline.question("Password: ");
    } finally {
      readline.close();
    }
  }

  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  const chunks: string[] = [];
  process.stdin.on("data", (chunk) => chunks.push(String(chunk)));
  await once(process.stdin, "end");
  return chunks.join("").trimEnd();
}

async function requestMagicLink(email: string): Promise<void> {
  if (!config.AUTH_MAGIC_LINK_ENABLED) {
    throw new AppError("Magic-link login is disabled", {
      statusCode: 403,
      code: "magic_link_disabled",
    });
  }

  let user: User | null = null;
  try {
    user = getUser(email);
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }
  }

  const magicLink = createMagicLink({
    email: user?.email ?? MAGIC_LINK_REQUEST_SINK_EMAIL,
    purpose: "login",
  });

  if (user) {
    await magicLinkLoginEmail({
      to: user.email,
      token: magicLink.token,
      expiresAt: magicLink.expiresAt,
    });
  }
}

export const commandDefinitions: CliCommandDefinition[] = [
  {
    scope: "auth",
    help: {
      description: "Manage Business API CLI sessions and magic-link sign-in.",
      commands: [
        "login --email <email> [--password <password>]",
        "logout",
        "whoami [--token <token>]",
        "magic-link request --email <email>",
        "magic-link consume <token>",
      ],
      examples: [
        "auth login --email owner@example.com --password owner-password",
        "auth logout",
        "auth whoami --json",
        "auth magic-link request --email owner@example.com",
        "auth magic-link consume mlt_000000000000000000000000",
      ],
    },
    async handler({ subcommand, rest, positionalArgs, context }) {
      if (subcommand === "login") {
        if (!config.AUTH_PASSWORD_LOGIN_ENABLED) {
          throw new AppError("Password login is disabled", {
            statusCode: 403,
            code: "password_login_disabled",
          });
        }

        const { options } = parseFlexibleFlagArgs(rest, new Set(["json"]));
        const email = options.email;
        if (!email) {
          throw new Error("Missing required option: --email");
        }

        const password = options.password ?? (await readPasswordFromStdin());
        if (!password) {
          throw new Error("Missing password");
        }

        const user = await verifyUserPassword(email, password);
        const session = createSession(user.userId, {
          userAgent: "business-api-cli",
        });
        const sessionFile = writeCliSession(session);
        context.printJson({
          userId: user.userId,
          ...sessionFile,
          user: mapCliPublicUser(user),
        });
        return;
      }

      if (subcommand === "logout") {
        const session = readCliSession();
        if (session) {
          try {
            revokeSession(requireActiveSession(session.sessionToken).sessionId);
          } catch (error) {
            if (
              !(error instanceof AppError) ||
              (error.statusCode !== 401 && error.statusCode !== 404)
            ) {
              throw error;
            }
          }
        }

        clearCliSession();
        context.printJson({ ok: true });
        return;
      }

      if (subcommand === "whoami") {
        const auth = requireInjectedCliAuth(context.auth);
        context.printJson({
          user: mapCliPublicUser(auth.user),
          workspace: mapCliPublicWorkspace(getWorkspace()),
          source: auth.source,
        });
        return;
      }

      if (subcommand === "magic-link") {
        const [magicLinkCommand, ...magicLinkRest] = rest;

        if (magicLinkCommand === "request") {
          const { options } = parseFlexibleFlagArgs(
            magicLinkRest,
            new Set(["json"]),
          );
          if (!options.email) {
            throw new Error("Missing required option: --email");
          }

          await requestMagicLink(options.email);
          context.printJson({ ok: true });
          return;
        }

        if (magicLinkCommand === "consume") {
          if (!config.AUTH_MAGIC_LINK_ENABLED) {
            throw new AppError("Magic-link login is disabled", {
              statusCode: 403,
              code: "magic_link_disabled",
            });
          }

          const token = magicLinkRest[0];
          if (!token) {
            throw new Error("Missing magic-link token");
          }

          const magicLink = consumeMagicLink(token, "login");
          let user: User;
          try {
            user = markUserLoggedIn(magicLink.email);
          } catch (error) {
            if (isNotFoundError(error)) {
              throwInvalidMagicLinkToken();
            }
            throw error;
          }

          const session = createSession(user.userId, {
            userAgent: "business-api-cli",
          });
          const sessionFile = writeCliSession(session);
          context.printJson({
            userId: user.userId,
            ...sessionFile,
            user: mapCliPublicUser(user),
          });
          return;
        }
      }

      throwUnknownCommand(positionalArgs);
    },
  },
];
