import fs from "node:fs";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { mockUploadFile, resetTestState, restoreServiceTestEnvironment } from "./helpers/services.js";

describe("business-api core service flows", () => {
  beforeEach(async () => {
    await resetTestState();
  });

  afterEach(async () => {
    await restoreServiceTestEnvironment();
  });

  it("creates the company card and default tasks project", async () => {
    const { upsertCompanyCard } = await import("../src/services/company-card.js");
    const { listProjects } = await import("../src/services/projects.js");

    const company = upsertCompanyCard({
      legalName: "Northwind Robotics SL",
      displayName: "Northwind Robotics",
      taxId: "B12345678",
      email: "billing@northwind.example",
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

    expect(company.companyId).toMatch(/^comp_/);
    expect(listProjects()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ownerEntityId: company.companyId,
          name: "Tasks",
        }),
      ]),
    );
  });

  it("resolves an existing contact and auto-creates a missing one", async () => {
    const { upsertCompanyCard } = await import("../src/services/company-card.js");
    const { createContact, resolveContact, getContact } = await import("../src/services/contacts.js");

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

    const existing = createContact({
      type: "company",
      status: "active",
      roles: ["supplier"],
      displayName: "Papeleria Centro SL",
      legalName: "Papeleria Centro SL",
      taxId: "B87654321",
      email: "facturas@papeleriacentro.example",
    });

    expect(
      resolveContact({
        autoCreate: true,
        matchBy: ["taxId", "email", "legalName"],
        contact: {
          type: "company",
          status: "active",
          roles: ["supplier"],
          displayName: "Papeleria Centro SL",
          legalName: "Papeleria Centro SL",
          taxId: "B87654321",
          email: "facturas@papeleriacentro.example",
        },
      }),
    ).toEqual({
      contactId: existing.contactId,
      resolution: "matched",
        matchedBy: "taxId",
      });

    expect(
      resolveContact({
        autoCreate: true,
        matchBy: ["canonicalName"],
        contact: {
          type: "company",
          status: "active",
          roles: ["supplier"],
          displayName: "Papeleria Centro",
          legalName: "Papeleria Centro",
        },
      }),
    ).toEqual({
      contactId: existing.contactId,
      resolution: "matched",
      matchedBy: "canonicalName",
    });

    const created = resolveContact({
      autoCreate: true,
      matchBy: ["taxId", "email", "canonicalName", "legalName"],
      contact: {
        type: "company",
        status: "active",
        roles: ["customer"],
        displayName: "Acme Retail GmbH",
        legalName: "Acme Retail GmbH",
        taxId: "DE123456789",
        email: "ap@acme-retail.example",
      },
    });

    expect(created.resolution).toBe("created");
    expect(getContact(created.contactId)).toEqual(
      expect.objectContaining({
        displayName: "Acme Retail GmbH",
      }),
    );
  });

  it("fails contact resolution when canonicalized company names are ambiguous", async () => {
    const { upsertCompanyCard } = await import("../src/services/company-card.js");
    const { createContact, resolveContact } = await import("../src/services/contacts.js");

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

    createContact({
      type: "company",
      status: "active",
      roles: ["customer"],
      displayName: "Acme Retail GmbH",
      legalName: "Acme Retail GmbH",
    });
    createContact({
      type: "company",
      status: "active",
      roles: ["customer"],
      displayName: "Acme Retail SL",
      legalName: "Acme Retail SL",
    });

    expect(() =>
      resolveContact({
        autoCreate: true,
        matchBy: ["canonicalName"],
        contact: {
          type: "company",
          status: "active",
          roles: ["customer"],
          displayName: "Acme Retail",
          legalName: "Acme Retail",
        },
      }),
    ).toThrowError(/Contact resolution is ambiguous/);
  });

  it("updates contact channel identifiers and notification preferences", async () => {
    const { createContact, updateContact, getContact } = await import("../src/services/contacts.js");

    const contact = createContact({
      type: "person",
      status: "active",
      roles: ["contact"],
      displayName: "Marta Slack",
      email: "marta@example.com",
    });

    const updated = updateContact(contact.contactId, {
      slackUserId: "U123456",
      discordUserId: "9988776655",
      whatsappUserId: "34600111222",
      telegramUserId: "marta_ops",
      notificationPreferences: {
        preferredNotificationSchedule: "weekdays 09:00-17:00 Europe/Madrid",
        doNotDisturb: true,
        channelRooms: {
          slack: ["C-ops", "C-support"],
          discord: ["operations"],
          telegram: ["ops-alerts"],
        },
      },
    });

    expect(updated).toEqual(
      expect.objectContaining({
        slackUserId: "U123456",
        discordUserId: "9988776655",
        whatsappUserId: "34600111222",
        telegramUserId: "marta_ops",
        notificationPreferences: {
          preferredNotificationSchedule: "weekdays 09:00-17:00 Europe/Madrid",
          doNotDisturb: true,
          channelRooms: {
            slack: ["C-ops", "C-support"],
            discord: ["operations"],
            telegram: ["ops-alerts"],
          },
        },
      }),
    );

    const cleared = updateContact(contact.contactId, {
      slackUserId: null,
      notificationPreferences: null,
    });

    expect(cleared.slackUserId).toBeNull();
    expect(cleared.notificationPreferences).toBeNull();
    expect(getContact(contact.contactId)).toEqual(
      expect.objectContaining({
        discordUserId: "9988776655",
        slackUserId: null,
        notificationPreferences: null,
      }),
    );
  });

  it("creates, validates, and revokes contact auth tokens", async () => {
    const { createContact } = await import("../src/services/contacts.js");
    const {
      createContactAuthToken,
      requireActiveContactAuthToken,
      revokeContactAuthToken,
    } = await import("../src/services/contact-auth-tokens.js");

    const contact = createContact({
      type: "person",
      status: "active",
      roles: ["employee"],
      displayName: "Diego Ops",
      email: "diego@example.com",
    });

    const authToken = createContactAuthToken(contact.contactId, {
      ttlMs: 60_000,
    });

    expect(authToken).toEqual(
      expect.objectContaining({
        authTokenId: expect.stringMatching(/^ctauth_/),
        contactId: contact.contactId,
        token: expect.stringMatching(/^ctok_/),
      }),
    );

    expect(requireActiveContactAuthToken(authToken.token)).toEqual(
      expect.objectContaining({
        authTokenId: authToken.authTokenId,
        contactId: contact.contactId,
        revokedAt: null,
      }),
    );

    const expiredToken = createContactAuthToken(contact.contactId, {
      ttlMs: -1,
    });
    expect(() => requireActiveContactAuthToken(expiredToken.token)).toThrowError(
      /invalid or expired/,
    );

    revokeContactAuthToken(authToken.authTokenId);
    expect(() => requireActiveContactAuthToken(authToken.token)).toThrowError(
      /invalid or expired/,
    );
  });

  it("uploads documents and records expenses with transitions", async () => {
    const { upsertCompanyCard } = await import("../src/services/company-card.js");
    const { createContact } = await import("../src/services/contacts.js");
    const { uploadDocument, getDocumentDownload } = await import("../src/services/documents.js");
    const { createExpense, updateExpense, listExpenses } = await import("../src/services/expenses.js");

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

    const supplier = createContact({
      type: "company",
      status: "active",
      roles: ["supplier"],
      displayName: "Papeleria Centro SL",
      legalName: "Papeleria Centro SL",
      taxId: "B87654321",
      email: "facturas@papeleriacentro.example",
    });

    const document = uploadDocument(
      mockUploadFile("invoice-2026-0042.pdf", "application/pdf", "pdf-data-1", 9),
      {
        kind: "expense_invoice",
        source: "email_forward",
      },
    );

    const expense = createExpense({
      supplierContactId: supplier.contactId,
      documentId: document.documentId,
      invoiceNumber: "FC-2026-0042",
      invoiceDate: "2026-03-25",
      dueDate: "2026-04-24",
      currency: "EUR",
      totals: {
        net: "120",
        tax: "25.2",
        gross: "145.2",
      },
      taxLines: [
        {
          name: "IVA",
          rate: "21",
          base: "120",
          amount: "25.2",
        },
      ],
      lineItems: [
        {
          description: "Printer paper and toner",
          quantity: "1",
          unitPrice: "120.00",
          taxRate: "21.00",
        },
      ],
      category: "office_supplies",
      notes: "Printer paper and toner.",
      status: "recorded",
    });

    expect(expense.totals).toEqual({
      net: "120.00",
      tax: "25.20",
      gross: "145.20",
    });
    expect(expense.supplierDisplayName).toBe("Papeleria Centro SL");
    expect(expense.supplierLegalName).toBe("Papeleria Centro SL");
    expect(expense.supplierEmail).toBe("facturas@papeleriacentro.example");
    expect(expense.lineItems).toEqual([
      {
        description: "Printer paper and toner",
        quantity: "1",
        unitPrice: "120.00",
        taxRate: "21.00",
      },
    ]);
    expect(fs.existsSync(getDocumentDownload(document.documentId).path)).toBe(true);

    const paid = updateExpense(expense.expenseId, {
      status: "paid",
    });

    expect(paid.status).toBe("paid");
    expect(await listExpenses({ status: "paid" })).toHaveLength(1);
  });
});
