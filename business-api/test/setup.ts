import fs from "node:fs";
import path from "node:path";

process.env.NODE_ENV = "test";
process.env.PORT = "3199";
process.env.API_KEY = "test-api-key";
process.env.DATABASE_PATH = "./test-data/business-api.sqlite";
process.env.UPLOAD_DIR = "./test-data/uploads";

const testDataDir = path.resolve(process.cwd(), "test-data");
fs.rmSync(testDataDir, { recursive: true, force: true });
fs.mkdirSync(testDataDir, { recursive: true });
