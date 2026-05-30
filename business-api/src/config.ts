import path from "node:path";
import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const booleanishSchema = z
  .enum(["0", "1", "false", "true"])
  .transform((value) => value === "1" || value === "true");

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3100),
  DATABASE_PATH: z.string().default("./data/business-api.sqlite"),
  UPLOAD_DIR: z.string().default("./uploads"),
  TMP_DIR: z.string().default("./data/tmp"),
  API_KEY: z.string().optional(),
  WORKSPACE_NAME: z.string().default("Default Workspace"),
  WORKSPACE_SLUG: z.string().default("default"),
  BOOTSTRAP_OWNER_EMAIL: z.string().email().optional(),
  BOOTSTRAP_OWNER_PASSWORD: z.string().optional(),
  DASHBOARD_BASE_URL: z.string().url().default("http://localhost:5173"),
  CORS_ALLOWED_ORIGINS: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(14),
  SESSION_MAX_LIFETIME_DAYS: z.coerce.number().int().positive().default(30),
  HUB_AUTH_MODE: z.enum(["api-key", "pam"]).default("api-key"),
  HUB_PASSWORD_LOGIN: booleanishSchema.default("1"),
  AUTH_PASSWORD_LOGIN_ENABLED: booleanishSchema.optional(),
  AUTH_MAGIC_LINK_ENABLED: booleanishSchema.default("true"),
  AUTH_RATE_LIMIT_ENABLED: booleanishSchema.default("true"),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60 * 1000),
  AUTH_LOGIN_IP_LIMIT: z.coerce.number().int().positive().default(30),
  AUTH_LOGIN_EMAIL_LIMIT: z.coerce.number().int().positive().default(5),
  AUTH_MAGIC_LINK_REQUEST_IP_LIMIT: z.coerce
    .number()
    .int()
    .positive()
    .default(30),
  AUTH_MAGIC_LINK_REQUEST_EMAIL_LIMIT: z.coerce
    .number()
    .int()
    .positive()
    .default(5),
  AUTH_MAGIC_LINK_CONSUME_IP_LIMIT: z.coerce
    .number()
    .int()
    .positive()
    .default(60),
  AUTH_MAGIC_LINK_CONSUME_TOKEN_LIMIT: z.coerce
    .number()
    .int()
    .positive()
    .default(5),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  LLMS_CONFIG_PATH: z.string().optional(),
  EMBEDDING_API_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  OCR_LANG: z.string().default("eng"),
  OCR_STUB_MODE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  EMBEDDING_ALLOW_STUB_FALLBACK: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

const parsed = envSchema.parse(process.env);
const projectRoot = path.resolve(import.meta.dirname, "..");
const authPasswordLoginEnabled =
  parsed.AUTH_PASSWORD_LOGIN_ENABLED ?? parsed.HUB_PASSWORD_LOGIN;

function parseAllowedOrigins(): string[] {
  const dashboardOrigin = new URL(parsed.DASHBOARD_BASE_URL).origin;
  const configuredOrigins = parsed.CORS_ALLOWED_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return Array.from(
    new Set(configuredOrigins?.length ? configuredOrigins : [dashboardOrigin]),
  );
}

export const config = {
  ...parsed,
  AUTH_PASSWORD_LOGIN_ENABLED: authPasswordLoginEnabled,
  corsAllowedOrigins: parseAllowedOrigins(),
  projectRoot,
  databasePath: path.resolve(projectRoot, parsed.DATABASE_PATH),
  uploadDir: path.resolve(projectRoot, parsed.UPLOAD_DIR),
  tmpDir: path.resolve(projectRoot, parsed.TMP_DIR),
  llmsConfigPath: parsed.LLMS_CONFIG_PATH
    ? path.resolve(projectRoot, parsed.LLMS_CONFIG_PATH)
    : path.resolve(projectRoot, "config/llms.yaml"),
};

export type AppConfig = typeof config;
