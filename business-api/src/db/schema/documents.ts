import { sql } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

import { companyCard } from "./company-card.js";

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  companyCardId: text("company_card_id")
    .notNull()
    .references(() => companyCard.id),
  kind: text("kind").notNull(),
  source: text("source"),
  originalFilename: text("original_filename").notNull(),
  mimeType: text("mime_type").notNull(),
  filePath: text("file_path").notNull(),
  checksum: text("checksum"),
  storageStatus: text("storage_status").notNull().default("stored"),
  ocrStatus: text("ocr_status").notNull().default("pending"),
  ocrText: text("ocr_text"),
  ocrError: text("ocr_error"),
  ocrEngine: text("ocr_engine"),
  ocrCompletedAt: text("ocr_completed_at"),
  extractedDataJson: text("extracted_data_json"),
  linkedEntityType: text("linked_entity_type"),
  linkedEntityId: text("linked_entity_id"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  deletedAt: text("deleted_at"),
});
