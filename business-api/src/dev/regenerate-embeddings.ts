import { eq, isNull } from "drizzle-orm";

import { initializeDatabase, getDatabase, getOrm } from "../db/connection.js";
import {
  companyCard,
  contacts,
  deals,
  documents,
  expenses,
  salesInvoices,
  tasks,
} from "../db/schema/index.js";
import { type EmbeddingEntityType, computeEmbeddingText, upsertEmbedding } from "../lib/embeddings.js";
import { logger } from "../lib/logger.js";

type RegenerationStats = {
  deleted: number;
  regenerated: number;
};

const SUPPORTED_ENTITY_TYPES: readonly EmbeddingEntityType[] = [
  "company_card",
  "contact",
  "document",
  "deal",
  "expense_invoice",
  "sales_invoice",
  "task",
];

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function deleteEmbeddings(entityType: EmbeddingEntityType): number {
  const sqlite = getDatabase();
  const rows = sqlite
    .prepare("SELECT rowid FROM entity_embeddings WHERE entity_type = ?")
    .all(entityType) as Array<{ rowid: number }>;

  const deleteVectorRow = sqlite.prepare("DELETE FROM vec_embeddings WHERE rowid = ?");
  const deleteEmbeddingRow = sqlite.prepare("DELETE FROM entity_embeddings WHERE entity_type = ?");

  const transaction = sqlite.transaction(() => {
    for (const row of rows) {
      deleteVectorRow.run(row.rowid);
    }
    deleteEmbeddingRow.run(entityType);
  });

  transaction();
  return rows.length;
}

async function regenerateCompanyCardEmbeddings(): Promise<number> {
  const rows = getOrm().select().from(companyCard).where(isNull(companyCard.deletedAt)).all();

  for (const row of rows) {
    await upsertEmbedding(
      "company_card",
      row.id,
      computeEmbeddingText("company_card", {
        displayName: row.displayName,
        legalName: row.legalName,
        taxId: row.taxId,
        email: row.email,
        phone: row.phone,
        website: row.website,
      }),
    );
  }

  return rows.length;
}

async function regenerateContactEmbeddings(): Promise<number> {
  const rows = getOrm().select().from(contacts).where(isNull(contacts.deletedAt)).all();

  for (const row of rows) {
    await upsertEmbedding(
      "contact",
      row.id,
      computeEmbeddingText("contact", {
        displayName: row.displayName,
        legalName: row.legalName,
        roles: JSON.parse(row.roles) as unknown[],
        taxId: row.taxId,
        email: row.email,
        notes: row.notes,
      }),
    );
  }

  return rows.length;
}

async function regenerateDocumentEmbeddings(): Promise<number> {
  const rows = getOrm().select().from(documents).where(isNull(documents.deletedAt)).all();

  for (const row of rows) {
    await upsertEmbedding(
      "document",
      row.id,
      computeEmbeddingText("document", {
        kind: row.kind,
        source: row.source,
        originalFilename: row.originalFilename,
        mimeType: row.mimeType,
        ocrStatus: row.ocrStatus,
        ocrText: row.ocrText,
        extractedData: row.extractedDataJson ? (JSON.parse(row.extractedDataJson) as unknown) : undefined,
      }),
    );
  }

  return rows.length;
}

async function regenerateDealEmbeddings(): Promise<number> {
  const rows = getOrm().select().from(deals).where(isNull(deals.deletedAt)).all();

  for (const row of rows) {
    await upsertEmbedding(
      "deal",
      row.id,
      computeEmbeddingText("deal", {
        title: row.title,
        stage: row.stage,
        notes: row.notes,
        lineItems: JSON.parse(row.lineItems) as unknown[],
      }),
    );
  }

  return rows.length;
}

async function regenerateExpenseEmbeddings(): Promise<number> {
  const rows = getOrm().select().from(expenses).where(isNull(expenses.deletedAt)).all();

  for (const row of rows) {
    const supplier = getOrm().select().from(contacts).where(eq(contacts.id, row.supplierContactId)).get();

    await upsertEmbedding(
      "expense_invoice",
      row.id,
      computeEmbeddingText("expense_invoice", {
        supplierDisplayName: supplier?.displayName ?? null,
        supplierLegalName: supplier?.legalName ?? null,
        supplierEmail: supplier?.email ?? null,
        invoiceNumber: row.invoiceNumber,
        invoiceDate: row.invoiceDate,
        dueDate: row.dueDate,
        currency: row.currency,
        net: row.net,
        tax: row.tax,
        gross: row.gross,
        taxLines: row.taxLines ? (JSON.parse(row.taxLines) as unknown[]) : [],
        category: row.category,
        notes: row.notes,
        status: row.status,
      }),
    );
  }

  return rows.length;
}

async function regenerateSalesInvoiceEmbeddings(): Promise<number> {
  const rows = getOrm().select().from(salesInvoices).where(isNull(salesInvoices.deletedAt)).all();

  for (const row of rows) {
    const customer = getOrm().select().from(contacts).where(eq(contacts.id, row.customerContactId)).get();

    await upsertEmbedding(
      "sales_invoice",
      row.id,
      computeEmbeddingText("sales_invoice", {
        invoiceNumber: row.invoiceNumber,
        status: row.status,
        customerDisplayName: customer?.displayName ?? null,
        customerLegalName: customer?.legalName ?? null,
        customerEmail: customer?.email ?? null,
        currency: row.currency,
        issueDate: row.issueDate,
        serviceDate: row.serviceDate,
        dueDate: row.dueDate,
        lineItems: JSON.parse(row.lineItems) as unknown[],
      }),
    );
  }

  return rows.length;
}

async function regenerateTaskEmbeddings(): Promise<number> {
  const rows = getOrm().select().from(tasks).where(isNull(tasks.deletedAt)).all();

  for (const row of rows) {
    await upsertEmbedding(
      "task",
      row.id,
      computeEmbeddingText("task", {
        title: row.title,
        description: row.description,
        status: row.status,
        priority: row.priority,
      }),
    );
  }

  return rows.length;
}

const regenerationHandlers: Record<EmbeddingEntityType, () => Promise<number>> = {
  company_card: regenerateCompanyCardEmbeddings,
  contact: regenerateContactEmbeddings,
  document: regenerateDocumentEmbeddings,
  deal: regenerateDealEmbeddings,
  expense_invoice: regenerateExpenseEmbeddings,
  sales_invoice: regenerateSalesInvoiceEmbeddings,
  task: regenerateTaskEmbeddings,
};

export async function regenerateEmbeddingsForAllEntities(): Promise<{
  ok: true;
  appliedMigrations: string[];
  stats: Record<EmbeddingEntityType, RegenerationStats>;
}> {
  const { appliedMigrations } = initializeDatabase();
  const stats = {} as Record<EmbeddingEntityType, RegenerationStats>;

  for (const entityType of SUPPORTED_ENTITY_TYPES) {
    const deleted = deleteEmbeddings(entityType);
    const regenerated = await regenerationHandlers[entityType]();
    stats[entityType] = { deleted, regenerated };
  }

  return {
    ok: true,
    appliedMigrations,
    stats,
  };
}

async function main(): Promise<void> {
  const result = await regenerateEmbeddingsForAllEntities();
  printJson(result);
}

main().catch((error) => {
  logger.error("Failed to regenerate embeddings", { error });
  process.exitCode = 1;
});
