import fs from "node:fs";
import path from "node:path";
import type { Server } from "node:http";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const testDataDir = path.resolve(process.cwd(), "test-data");

async function resetTestState() {
  const { resetDatabase, initializeDatabase } = await import("../src/db/connection.js");
  resetDatabase();
  fs.rmSync(testDataDir, { recursive: true, force: true });
  fs.mkdirSync(testDataDir, { recursive: true });
  initializeDatabase();
}

describe("business-api routes", () => {
  let server: Server | undefined;
  let baseUrl = "";

  beforeEach(async () => {
    await resetTestState();
    const { upsertCompanyCard } = await import("../src/services/company-card.js");
    upsertCompanyCard({
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
        server!.close((error: Error | undefined) => (error ? reject(error) : resolve()));
      });
    }
    server = undefined;
  });

  it("rejects API requests without a valid API key", async () => {
    const response = await fetch(`${baseUrl}/api/v1/company-card`);
    expect(response.status).toBe(401);
  });

  it("uploads and downloads a document through the HTTP API", async () => {
    const formData = new FormData();
    formData.set("kind", "expense_invoice");
    formData.set("source", "email_forward");
    formData.set("file", new File([Buffer.from("pdf-data-2")], "invoice.pdf", { type: "application/pdf" }));

    const uploadResponse = await fetch(`${baseUrl}/api/v1/documents`, {
      method: "POST",
      headers: {
        authorization: "Bearer test-api-key",
      },
      body: formData,
    });

    expect(uploadResponse.status).toBe(201);
    const uploaded = (await uploadResponse.json()) as { documentId: string; filename: string };
    expect(uploaded.filename).toBe("invoice.pdf");

    const downloadResponse = await fetch(`${baseUrl}/api/v1/documents/${uploaded.documentId}/download`, {
      headers: {
        authorization: "Bearer test-api-key",
      },
    });

    expect(downloadResponse.status).toBe(200);
    expect(Buffer.from(await downloadResponse.arrayBuffer()).toString()).toBe("pdf-data-2");
  });

  it("creates and reads contacts through the HTTP API", async () => {
    const createResponse = await fetch(`${baseUrl}/api/v1/contacts`, {
      method: "POST",
      headers: {
        authorization: "Bearer test-api-key",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        type: "company",
        roles: ["customer"],
        displayName: "Acme Retail GmbH",
        legalName: "Acme Retail GmbH",
        taxId: "DE123456789",
        email: "ap@acme-retail.example",
      }),
    });

    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as { contactId: string };

    const getResponse = await fetch(`${baseUrl}/api/v1/contacts/${created.contactId}`, {
      headers: {
        authorization: "Bearer test-api-key",
      },
    });

    expect(getResponse.status).toBe(200);
    expect((await getResponse.json()) as { displayName: string }).toEqual(
      expect.objectContaining({
        displayName: "Acme Retail GmbH",
      }),
    );
  });
});
