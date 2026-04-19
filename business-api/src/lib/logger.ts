import { createLogger, format, transports } from "winston";

import { config } from "../config.js";

const TRUTHY_ENV_VALUES = new Set(["1", "t", "true", "yes", "on"]);

function isTruthyEnvValue(value: string | undefined): boolean {
  return typeof value === "string" && TRUTHY_ENV_VALUES.has(value.trim().toLowerCase());
}

function isCliVerboseEnabled(): boolean {
  if (process.argv.includes("--verbose")) {
    return true;
  }

  return isTruthyEnvValue(process.env.WROBO_BUSINESS_API_CLI_VERBOSE);
}

function shouldSilenceLogger(): boolean {
  const isWrapperCliInvocation = isTruthyEnvValue(process.env.WROBO_BUSINESS_API_CLI_MODE);

  return isWrapperCliInvocation && !isCliVerboseEnabled();
}

function serializeError(error: unknown): unknown {
  if (!(error instanceof Error)) {
    return error;
  }

  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    cause: serializeError(error.cause),
  };
}

const errorFormat = format((info) => {
  if ("error" in info) {
    info.error = serializeError(info.error);
  }

  return info;
});

export const logger = createLogger({
  level: config.LOG_LEVEL,
  silent: shouldSilenceLogger(),
  defaultMeta: {
    service: "business-api",
    environment: config.NODE_ENV,
  },
  format: format.combine(
    errorFormat(),
    format.timestamp(),
    format.errors({ stack: true }),
    format.json(),
  ),
  transports: [new transports.Console({ stderrLevels: ["debug", "info", "warn", "error"] })],
});
