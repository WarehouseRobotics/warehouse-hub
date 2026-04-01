import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const companyCard = sqliteTable("company_card", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  legalName: text("legal_name").notNull(),
  displayName: text("display_name").notNull(),
  taxId: text("tax_id"),
  vatId: text("vat_id"),
  email: text("email"),
  phone: text("phone"),
  website: text("website"),
  addressStreet1: text("address_street1"),
  addressStreet2: text("address_street2"),
  addressCity: text("address_city"),
  addressPostalCode: text("address_postal_code"),
  addressCountryCode: text("address_country_code"),
  currency: text("currency").notNull(),
  paymentTermsDays: integer("payment_terms_days").notNull().default(30),
  vatMode: text("vat_mode").notNull().default("standard"),
  bankIbanMasked: text("bank_iban_masked"),
  bankBic: text("bank_bic"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  deletedAt: text("deleted_at"),
});
