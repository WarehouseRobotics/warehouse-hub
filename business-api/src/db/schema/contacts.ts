import { sql } from "drizzle-orm";
import { type AnySQLiteColumn, index, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const contacts = sqliteTable(
  "contacts",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    parentContactId: text("parent_contact_id").references((): AnySQLiteColumn => contacts.id),
    type: text("type", { enum: ["person", "company"] }).notNull(),
    roles: text("roles").notNull(),
    displayName: text("display_name").notNull(),
    legalName: text("legal_name"),
    taxId: text("tax_id"),
    email: text("email"),
    phone: text("phone"),
    slackUserId: text("slack_user_id"),
    discordUserId: text("discord_user_id"),
    whatsappUserId: text("whatsapp_user_id"),
    telegramUserId: text("telegram_user_id"),
    notificationPreferences: text("notification_preferences"),
    billingAddressStreet1: text("billing_address_street1"),
    billingAddressStreet2: text("billing_address_street2"),
    billingAddressCity: text("billing_address_city"),
    billingAddressPostalCode: text("billing_address_postal_code"),
    billingAddressCountryCode: text("billing_address_country_code"),
    notes: text("notes"),
    status: text("status").notNull().default("active"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    deletedAt: text("deleted_at"),
  },
  (table) => ({
    parentContactIdx: index("contacts_parent_contact_id_idx").on(table.parentContactId),
    displayNameIdx: index("contacts_display_name_idx").on(table.displayName),
  }),
);
