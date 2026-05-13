import fs from "node:fs";
import path from "node:path";

import { vi } from "vitest";

export const testDataDir = path.resolve(process.cwd(), "test-data");
export const llmConfigPath = path.join(testDataDir, "llms.mock.yaml");

export async function resetTestState() {
  const { resetDatabase, initializeDatabase } = await import("../../src/db/connection.js");
  resetDatabase();
  fs.mkdirSync(testDataDir, { recursive: true });
  fs.rmSync(path.join(testDataDir, "business-api.sqlite"), { force: true });
  fs.rmSync(path.join(testDataDir, "uploads"), { recursive: true, force: true });
  fs.rmSync(path.join(testDataDir, "llms.mock.yaml"), { force: true });
  initializeDatabase();
}

export async function restoreServiceTestEnvironment() {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  process.env.LLMS_CONFIG_PATH = "./test-data/llms.mock.yaml";
  process.env.EMBEDDING_ALLOW_STUB_FALLBACK = "true";
  const { resetEmbeddingProviderConfigCache } = await import("../../src/lib/llm-config.js");
  resetEmbeddingProviderConfigCache();
}

export async function setupDefaultCompanyCard() {
  const { upsertCompanyCard } = await import("../../src/services/company-card.js");
  return upsertCompanyCard({
    legalName: "Northwind Robotics SL",
    displayName: "Northwind Robotics",
    taxId: "B12345678",
    address: {
      street1: "Calle de Alcala 42",
      city: "Madrid",
      postalCode: "28014",
      countryCode: "ES",
    },
    invoiceDefaults: {
      currency: "EUR",
      paymentTermsDays: 30,
      vatMode: "standard",
    },
  });
}

export async function setupWarehouseCompanyCard() {
  const { upsertCompanyCard } = await import("../../src/services/company-card.js");
  return upsertCompanyCard({
    legalName: "Warehouse Robotics SL",
    displayName: "Warehouse Robotics",
    taxId: "B12345678",
    address: {
      street1: "Calle de Alcala 42",
      city: "Madrid",
      postalCode: "28014",
      countryCode: "ES",
    },
    invoiceDefaults: {
      currency: "EUR",
      paymentTermsDays: 30,
      vatMode: "standard",
    },
  });
}

export function mockUploadFile(originalname: string, mimetype: string, contents: string | Buffer, size?: number) {
  const buffer = Buffer.isBuffer(contents) ? contents : Buffer.from(contents);
  return {
    fieldname: "file",
    originalname,
    encoding: "7bit",
    mimetype,
    size: size ?? buffer.length,
    buffer,
    stream: undefined as never,
    destination: "",
    filename: "",
    path: "",
  };
}

export async function waitFor<T>(callback: () => Promise<T>, predicate: (value: T) => boolean, attempts = 20): Promise<T> {
  let lastValue = await callback();
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (predicate(lastValue)) {
      return lastValue;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
    lastValue = await callback();
  }

  return lastValue;
}
