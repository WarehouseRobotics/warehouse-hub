import path from "node:path";
import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

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
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(14),
  HUB_AUTH_MODE: z.enum(["api-key", "pam"]).default("api-key"),
  HUB_PASSWORD_LOGIN: z
    .enum(["0", "1"])
    .default("1")
    .transform((value) => value === "1"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  LLMS_CONFIG_PATH: z.string().optional(),
  EMBEDDING_API_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  OPENCLAW_CONTROL_API_HOST: z.string().default("127.0.0.1"),
  OPENCLAW_CONTROL_API_PORT: z.coerce.number().int().positive().default(8181),
  OPENCLAW_DATA_FETCHER_AGENT: z.string().optional(),
  OPENCLAW_GATEWAY_TOKEN: z.string().optional(),
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

export const config = {
  ...parsed,
  projectRoot,
  databasePath: path.resolve(projectRoot, parsed.DATABASE_PATH),
  uploadDir: path.resolve(projectRoot, parsed.UPLOAD_DIR),
  tmpDir: path.resolve(projectRoot, parsed.TMP_DIR),
  llmsConfigPath: parsed.LLMS_CONFIG_PATH
    ? path.resolve(projectRoot, parsed.LLMS_CONFIG_PATH)
    : path.resolve(projectRoot, "config/llms.yaml"),
};

export type AppConfig = typeof config;
