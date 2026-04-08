import fs from "node:fs";
import path from "node:path";

process.env.NODE_ENV = "test";
process.env.PORT = "3199";
process.env.API_KEY = "test-api-key";
process.env.DATABASE_PATH = "./test-data/business-api.sqlite";
process.env.UPLOAD_DIR = "./test-data/uploads";
process.env.OCR_STUB_MODE = "true";
process.env.EMBEDDING_ALLOW_STUB_FALLBACK = "true";

const testDataDir = path.resolve(process.cwd(), "test-data");
fs.mkdirSync(testDataDir, { recursive: true });
fs.rmSync(path.join(testDataDir, "business-api.sqlite"), { force: true });
fs.rmSync(path.join(testDataDir, "uploads"), { recursive: true, force: true });
fs.rmSync(path.join(testDataDir, "llms.mock.yaml"), { force: true });
