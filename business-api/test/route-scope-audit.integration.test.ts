import { afterEach, describe, expect, it } from "vitest";

import { closeAuthApp, createAuthApp } from "./helpers/auth-app.js";

afterEach(closeAuthApp);

describe("protected route scope and audit wiring", () => {
  it("lets read-scoped PATs read but blocks data mutations", async () => {
    const baseUrl = await createAuthApp();
    const { createToken } = await import(
      "../src/services/personal-access-tokens.js"
    );
    const { createUser } = await import("../src/services/users.js");
    const user = await createUser({
      email: "reader@example.com",
      displayName: "Reader",
      role: "member",
    });
    const token = createToken(user.userId, {
      name: "Read token",
      actorType: "agent",
      scopes: ["read"],
    });

    const readResponse = await fetch(`${baseUrl}/api/v1/company-card`, {
      headers: { authorization: `Bearer ${token.plaintext}` },
    });
    expect(readResponse.status).toBe(404);

    const writeResponse = await fetch(`${baseUrl}/api/v1/company-card`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token.plaintext}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        legalName: "Northwind Robotics SL",
        displayName: "Northwind Robotics",
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
      }),
    });
    expect(writeResponse.status).toBe(403);
  });

  it("audits successful data mutations with PAT actor context", async () => {
    const baseUrl = await createAuthApp();
    const { listAuditLogEntries } = await import(
      "../src/services/audit-log.js"
    );
    const { createToken } = await import(
      "../src/services/personal-access-tokens.js"
    );
    const { createUser } = await import("../src/services/users.js");
    const user = await createUser({
      email: "writer@example.com",
      displayName: "Writer",
      role: "member",
    });
    const token = createToken(user.userId, {
      name: "Write token",
      actorType: "agent",
      scopes: ["write"],
    });

    const response = await fetch(`${baseUrl}/api/v1/company-card`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token.plaintext}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
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
      }),
    });
    const company = (await response.json()) as { companyId: string };

    expect(response.status).toBe(200);
    expect(listAuditLogEntries()).toEqual([
      expect.objectContaining({
        actorUserId: user.userId,
        actorTokenId: token.tokenId,
        actorType: "agent",
        action: "company_card.upsert",
        objectType: "company_card",
        objectId: company.companyId,
      }),
    ]);
  });
});
