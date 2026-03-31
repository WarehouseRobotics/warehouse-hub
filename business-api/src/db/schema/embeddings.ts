import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const entityEmbeddings = sqliteTable("entity_embeddings", {
  id: text("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  contentHash: text("content_hash").notNull(),
  model: text("model").notNull(),
  createdAt: text("created_at").notNull(),
});
