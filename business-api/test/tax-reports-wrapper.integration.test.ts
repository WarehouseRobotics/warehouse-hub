import { execFile } from "node:child_process";
import fs from "node:fs";
import type { Server } from "node:http";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testDataDir = path.resolve(process.cwd(), "test-data", "tax-reports-wrapper");
const databasePath = path.join(testDataDir, "business-api.sqlite");
const uploadsPath = path.join(testDataDir, "uploads");
const wrapperPath = path.resolve(process.cwd(), "bin", "wrobo-biz");
const execFileAsync = promisify(execFile);

let server: Server | undefined;
let baseUrl = "";

function resetProcessEnv() {
  process.env.NODE_ENV = "test";
  process.env.PORT = "3199";
  process.env.API_KEY = "test-api-key";
  process.env.DATABASE_PATH = databasePath;
  process.env.UPLOAD_DIR = uploadsPath;
  process.env.OCR_STUB_MODE = "true";
  process.env.EMBEDDING_ALLOW_STUB_FALLBACK = "true";
  process.env.HUB_AUTH_MODE = "api-key";
}

async function resetTestState() {
  vi.resetModules();
  resetProcessEnv();
  fs.mkdirSync(testDataDir, { recursive: true });
  fs.rmSync(databasePath, { force: true });
  fs.rmSync(uploadsPath, { recursive: true, force: true });

  const { initializeDatabase, resetDatabase } = await import(
    "../src/db/connection.js"
  );
  resetDatabase();
  initializeDatabase();
}

async function createCompanyCard() {
  const { upsertCompanyCard } = await import("../src/services/company-card.js");
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

async function runWrapper(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(wrapperPath, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      WROBO_API_BASE_URL: baseUrl,
      WROBO_API_TOKEN: "test-api-key",
      WROBO_API_TIMEOUT_SECS: "10",
    },
    encoding: "utf8",
  });
  return stdout;
}

async function runWrapperFailure(args: string[]): Promise<string> {
  try {
    await runWrapper(args);
  } catch (error) {
    return String((error as { stderr?: Buffer | string }).stderr ?? "");
  }

  throw new Error(`Expected wrobo-biz command to fail: ${args.join(" ")}`);
}

function writeModelo303Fixture(name: string): string {
  const filePath = path.join(testDataDir, name);
  fs.writeFileSync(
    filePath,
    `
AEAT Modelo 303
Ejercicio: 2026
Periodo: Q4
NIF: B12345678
Presentacion id: AEAT303Q4
Casilla 71: 250,00
`,
  );
  return filePath;
}

describe("tax report remote CLI wrapper", () => {
  beforeEach(async () => {
    await resetTestState();

    const { createApp } = await import("../src/app.js");
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });

    const address = server!.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected TCP server address");
    }

    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((error: Error | undefined) =>
          error ? reject(error) : resolve(),
        );
      });
    }
    server = undefined;
    baseUrl = "";
  });

  it("rejects tax report ingest wrapper calls with missing arguments", async () => {
    const fixturePath = writeModelo303Fixture("missing-args.pdf");

    await expect(runWrapperFailure(["tax-reports", "ingest"])).resolves.toContain(
      "Missing file path",
    );
    await expect(
      runWrapperFailure(["tax-reports", "ingest", fixturePath]),
    ).resolves.toContain("Missing tax report ingestion metadata JSON argument");
    await expect(
      runWrapperFailure(["tax-reports", "ingest", fixturePath, "[]"]),
    ).resolves.toContain("tax report ingestion metadata must be a JSON object");
  });

  it("ingests a host-readable tax declaration file through the HTTP wrapper", { timeout: 15000 }, async () => {
    const company = await createCompanyCard();
    const fixturePath = writeModelo303Fixture("modelo-303-q4.pdf");

    const output = await runWrapper([
      "tax-reports",
      "ingest",
      fixturePath,
      JSON.stringify({
        kind: "tax_declaration",
        companyCardId: company.companyId,
        countryCode: "ES",
        source: "accountant_upload",
        overrides: {
          periodLabel: "2026-Q4",
        },
      }),
    ]);

    const result = JSON.parse(output) as {
      taxReport: { formCode: string; periodLabel: string };
      document: { ocrStatus: string; linkedEntityType: string };
      facts: Array<{ fieldCode: string }>;
    };

    expect(result).toEqual(
      expect.objectContaining({
        taxReport: expect.objectContaining({
          formCode: "303",
          periodLabel: "2026-Q4",
        }),
        document: expect.objectContaining({
          ocrStatus: "completed",
          linkedEntityType: "tax_report",
        }),
        facts: [expect.objectContaining({ fieldCode: "71" })],
      }),
    );
  });
});
