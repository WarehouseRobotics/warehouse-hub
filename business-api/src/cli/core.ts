import fs from "node:fs";
import path from "node:path";

import { config } from "../config.js";
import { isTruthyEnvValue } from "../lib/cli-error-format.js";
import { logger } from "../lib/logger.js";

export type CliHelpScope = {
  description: string;
  commands: string[];
  examples: string[];
};

export type CliContext = {
  rawArgs: string[];
  printJson: (value: unknown) => void;
  printLines: (lines: string[]) => void;
};

export type CliHandlerArgs = {
  subcommand: string | undefined;
  rest: string[];
  rawArgs: string[];
  positionalArgs: string[];
  context: CliContext;
};

export type CliCommandDefinition = {
  scope: string;
  aliases?: string[];
  help: CliHelpScope;
  hiddenFromHelp?: boolean;
  handler: (args: CliHandlerArgs) => Promise<void> | void;
};

export function isWrapperCliInvocation(): boolean {
  return isTruthyEnvValue(process.env.WROBO_BUSINESS_API_CLI_MODE);
}

export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function printLines(lines: string[]): void {
  process.stdout.write(`${lines.join("\n")}\n`);
}

export function parseJsonArg(value: string | undefined, label: string): unknown {
  if (!value) {
    throw new Error(`Missing ${label} JSON argument`);
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch (error) {
    logger.error("Invalid CLI JSON argument", { label, raw: value, error });
    throw new Error(`Invalid ${label} JSON argument: ${value}`, { cause: error });
  }

  return parsed;
}

export function resolveDocumentCliInputPath(filePath: string): string {
  if (path.isAbsolute(filePath) || filePath.includes("/") || filePath.includes("\\")) {
    return filePath;
  }

  return path.join(config.tmpDir, filePath);
}

export function parseFlagArgs(args: string[]): { positionals: string[]; options: Record<string, string> } {
  const positionals: string[] = [];
  const options: Record<string, string> = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const key = arg.slice(2);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for option: ${arg}`);
    }

    options[key] = value;
    index += 1;
  }

  return { positionals, options };
}

export function parseFlexibleFlagArgs(
  args: string[],
  booleanKeys = new Set<string>(),
  repeatableKeys = new Set<string>(),
): { positionals: string[]; options: Record<string, string>; booleans: Set<string>; repeated: Record<string, string[]> } {
  const positionals: string[] = [];
  const options: Record<string, string> = {};
  const booleans = new Set<string>();
  const repeated: Record<string, string[]> = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const key = arg.slice(2);
    if (booleanKeys.has(key)) {
      booleans.add(key);
      continue;
    }

    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for option: ${arg}`);
    }

    if (repeatableKeys.has(key)) {
      repeated[key] = [...(repeated[key] ?? []), value];
    } else {
      options[key] = value;
    }
    index += 1;
  }

  return { positionals, options, booleans, repeated };
}

export function parseNumberOption(value: string | undefined): number | undefined {
  return value === undefined ? undefined : Number(value);
}

export function createCliUploadFile(
  filePath: string,
  fileBuffer: Buffer,
  mimetype: string,
  originalname = path.basename(filePath) || "upload.bin",
): Express.Multer.File {
  return {
    fieldname: "file",
    originalname,
    encoding: "7bit",
    mimetype,
    size: fileBuffer.length,
    buffer: fileBuffer,
    stream: undefined as never,
    destination: "",
    filename: "",
    path: "",
  };
}

export function readCliUploadFile(
  filePath: string,
  mimetype: string,
  originalname = path.basename(filePath) || "upload.bin",
): Express.Multer.File {
  const fileBuffer = fs.readFileSync(filePath);
  return createCliUploadFile(filePath, fileBuffer, mimetype, originalname);
}

export function listFilterArgsFromOptions(options: Record<string, string>): string[] {
  return Object.entries({
    since: options.since,
    before: options.before,
    after: options.after,
    limit: options.limit,
  }).flatMap(([key, value]) => (value ? [`--${key}`, value] : []));
}

export function throwUnknownCommand(positionalArgs: string[]): never {
  throw new Error(`Unknown command: ${positionalArgs.join(" ")}`);
}
