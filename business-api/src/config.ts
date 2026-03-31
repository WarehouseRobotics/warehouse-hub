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
});

const parsed = envSchema.parse(process.env);
const projectRoot = path.resolve(import.meta.dirname, "..");

export const config = {
  ...parsed,
  projectRoot,
  databasePath: path.resolve(projectRoot, parsed.DATABASE_PATH),
  uploadDir: path.resolve(projectRoot, parsed.UPLOAD_DIR),
};

export type AppConfig = typeof config;
