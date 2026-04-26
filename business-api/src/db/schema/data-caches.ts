import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const dataCaches = sqliteTable("data_caches", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  keyType: text("key_type").notNull(),
  valueSchema: text("value_schema").notNull(),
  fetcherConfig: text("fetcher_config"),
  defaultTtlDays: integer("default_ttl_days"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const dataCacheEntries = sqliteTable(
  "data_cache_entries",
  {
    id: text("id").primaryKey(),
    cacheId: text("cache_id")
      .notNull()
      .references(() => dataCaches.id),
    entryKey: text("entry_key").notNull(),
    value: text("value").notNull(),
    source: text("source").notNull(),
    fetchedAt: text("fetched_at").notNull(),
    expiresAt: text("expires_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    cacheKeyUniqueIdx: uniqueIndex("data_cache_entries_cache_key_unique_idx").on(table.cacheId, table.entryKey),
    cacheKeyIdx: index("data_cache_entries_cache_key_idx").on(table.cacheId, table.entryKey),
    cacheCreatedIdx: index("data_cache_entries_cache_created_idx").on(table.cacheId, table.createdAt),
  }),
);
