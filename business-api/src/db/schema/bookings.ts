import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { companyCard } from "./company-card.js";
import { contacts } from "./contacts.js";
import { deals } from "./deals.js";
import { projects } from "./projects.js";
import { salesInvoices } from "./sales-invoices.js";
import { tasks } from "./tasks.js";

export const bookings = sqliteTable(
  "bookings",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    companyCardId: text("company_card_id")
      .notNull()
      .references(() => companyCard.id),
    customerContactId: text("customer_contact_id")
      .notNull()
      .references(() => contacts.id),
    projectId: text("project_id").references(() => projects.id),
    dealId: text("deal_id").references(() => deals.id),
    taskId: text("task_id").references(() => tasks.id),
    salesInvoiceId: text("sales_invoice_id").references(() => salesInvoices.id),
    title: text("title").notNull(),
    serviceType: text("service_type").notNull(),
    status: text("status").notNull().default("tentative"),
    scheduledStartAt: text("scheduled_start_at").notNull(),
    scheduledEndAt: text("scheduled_end_at").notNull(),
    timezone: text("timezone").notNull(),
    location: text("location"),
    assignedContactIds: text("assigned_contact_ids").notNull(),
    notes: text("notes"),
    completionNotes: text("completion_notes"),
    completedAt: text("completed_at"),
    cancelledAt: text("cancelled_at"),
    cancellationReason: text("cancellation_reason"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    deletedAt: text("deleted_at"),
  },
  (table) => ({
    customerIdx: index("bookings_customer_contact_id_idx").on(table.customerContactId),
    projectIdx: index("bookings_project_id_idx").on(table.projectId),
    dealIdx: index("bookings_deal_id_idx").on(table.dealId),
    scheduledIdx: index("bookings_scheduled_idx").on(table.scheduledStartAt, table.scheduledEndAt),
  }),
);

export const bookingAssignmentProfiles = sqliteTable(
  "booking_assignment_profiles",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    contactId: text("contact_id")
      .notNull()
      .unique()
      .references(() => contacts.id),
    isBookable: integer("is_bookable", { mode: "boolean" }).notNull().default(true),
    timezone: text("timezone").notNull(),
    weeklyAvailability: text("weekly_availability").notNull(),
    bufferBeforeMinutes: integer("buffer_before_minutes"),
    bufferAfterMinutes: integer("buffer_after_minutes"),
    maxBookingsPerDay: integer("max_bookings_per_day"),
    bookingTypes: text("booking_types"),
    effectiveFrom: text("effective_from"),
    effectiveTo: text("effective_to"),
    notes: text("notes"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    deletedAt: text("deleted_at"),
  },
  (table) => ({
    contactIdx: index("booking_assignment_profiles_contact_id_idx").on(table.contactId),
  }),
);

export const bookingAvailabilityExceptions = sqliteTable(
  "booking_availability_exceptions",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id),
    kind: text("kind").notNull(),
    startAt: text("start_at").notNull(),
    endAt: text("end_at").notNull(),
    reason: text("reason"),
    notes: text("notes"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    deletedAt: text("deleted_at"),
  },
  (table) => ({
    contactWindowIdx: index("booking_availability_exceptions_contact_window_idx").on(
      table.contactId,
      table.startAt,
      table.endAt,
    ),
  }),
);
