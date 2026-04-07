import path from "node:path";
import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3100),
  DATABASE_PATH: z.string().default("./data/business-api.sqlite"),
  UPLOAD_DIR: z.string().default("./uploads"),
  API_KEY: z.string().optional(),
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

export const config = {
  ...parsed,
  projectRoot,
  databasePath: path.resolve(projectRoot, parsed.DATABASE_PATH),
  uploadDir: path.resolve(projectRoot, parsed.UPLOAD_DIR),
  llmsConfigPath: parsed.LLMS_CONFIG_PATH
    ? path.resolve(projectRoot, parsed.LLMS_CONFIG_PATH)
    : path.resolve(projectRoot, "config/llms.yaml"),
};

export type AppConfig = typeof config;
