import { z } from "zod";

import { addressSchema } from "./company-card.js";

export const bookingStatusSchema = z.enum([
  "tentative",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
]);

export const bookingServiceTypeSchema = z.enum([
  "consultation",
  "visit",
  "installation",
  "maintenance",
  "workshop",
  "training",
  "other",
]);

export const bookingLocationSchema = z
  .object({
    kind: z.enum(["on_site", "remote", "phone", "office", "other"]),
    label: z.string().min(1).optional(),
    address: addressSchema.optional(),
    remoteUrl: z.string().url().optional(),
    notes: z.string().optional(),
  })
  .strict();

export const bookingInputSchema = z
  .object({
    customerContactId: z.string().min(1),
    projectId: z.string().min(1).optional(),
    dealId: z.string().min(1).optional(),
    taskId: z.string().min(1).optional(),
    salesInvoiceId: z.string().min(1).optional(),
    title: z.string().min(1),
    serviceType: bookingServiceTypeSchema.default("other"),
    status: bookingStatusSchema.default("tentative"),
    scheduledStartAt: z.string().min(1),
    scheduledEndAt: z.string().min(1),
    timezone: z.string().min(1),
    location: bookingLocationSchema.optional(),
    assignedContactIds: z.array(z.string().min(1)).default([]),
    notes: z.string().optional(),
  })
  .strict();

export const bookingPatchSchema = z
  .object({
    customerContactId: z.string().min(1).optional(),
    projectId: z.union([z.string().min(1), z.null()]).optional(),
    dealId: z.union([z.string().min(1), z.null()]).optional(),
    taskId: z.union([z.string().min(1), z.null()]).optional(),
    salesInvoiceId: z.union([z.string().min(1), z.null()]).optional(),
    title: z.string().min(1).optional(),
    serviceType: bookingServiceTypeSchema.optional(),
    status: bookingStatusSchema.optional(),
    scheduledStartAt: z.string().min(1).optional(),
    scheduledEndAt: z.string().min(1).optional(),
    timezone: z.string().min(1).optional(),
    location: z.union([bookingLocationSchema, z.null()]).optional(),
    assignedContactIds: z.array(z.string().min(1)).optional(),
    notes: z.union([z.string(), z.null()]).optional(),
    completionNotes: z.union([z.string(), z.null()]).optional(),
  })
  .strict();

export const bookingCompleteSchema = z
  .object({
    completionNotes: z.string().optional(),
    createFollowUpTask: z.boolean().default(false),
    followUpTaskTitle: z.string().min(1).optional(),
  })
  .strict();

export const bookingCancelSchema = z
  .object({
    reason: z.string().min(1),
  })
  .strict();

export const bookingAssignmentConflictCheckSchema = z
  .object({
    bookingId: z.string().min(1).optional(),
    serviceType: bookingServiceTypeSchema.default("other"),
    scheduledStartAt: z.string().min(1),
    scheduledEndAt: z.string().min(1),
    timezone: z.string().min(1),
    assignedContactIds: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const dayOfWeekSchema = z.enum([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);

export const bookingAvailabilityWindowSchema = z
  .object({
    start: z.string().regex(/^\d{2}:\d{2}$/),
    end: z.string().regex(/^\d{2}:\d{2}$/),
  })
  .strict();

export const bookingWeeklyAvailabilitySchema = z
  .object({
    dayOfWeek: dayOfWeekSchema,
    windows: z.array(bookingAvailabilityWindowSchema).min(1),
  })
  .strict();

export const bookingAssignmentProfileInputSchema = z
  .object({
    isBookable: z.boolean().default(true),
    timezone: z.string().min(1),
    weeklyAvailability: z.array(bookingWeeklyAvailabilitySchema).default([]),
    bufferBeforeMinutes: z.number().int().nonnegative().optional(),
    bufferAfterMinutes: z.number().int().nonnegative().optional(),
    maxBookingsPerDay: z.number().int().positive().optional(),
    bookingTypes: z.array(bookingServiceTypeSchema).optional(),
    effectiveFrom: z.string().optional(),
    effectiveTo: z.string().optional(),
    notes: z.string().optional(),
  })
  .strict();

export const bookingAvailabilityExceptionKindSchema = z.enum([
  "time_off",
  "blocked",
  "available_override",
]);

export const bookingAvailabilityExceptionInputSchema = z
  .object({
    contactId: z.string().min(1),
    kind: bookingAvailabilityExceptionKindSchema,
    startAt: z.string().min(1),
    endAt: z.string().min(1),
    reason: z.string().min(1).optional(),
    notes: z.string().optional(),
  })
  .strict();

export const bookingAvailabilityExceptionPatchSchema = z
  .object({
    kind: bookingAvailabilityExceptionKindSchema.optional(),
    startAt: z.string().min(1).optional(),
    endAt: z.string().min(1).optional(),
    reason: z.union([z.string().min(1), z.null()]).optional(),
    notes: z.union([z.string(), z.null()]).optional(),
  })
  .strict();

export type BookingInput = z.infer<typeof bookingInputSchema>;
export type BookingPatch = z.infer<typeof bookingPatchSchema>;
export type BookingCompleteInput = z.infer<typeof bookingCompleteSchema>;
export type BookingCancelInput = z.infer<typeof bookingCancelSchema>;
export type BookingAssignmentConflictCheckInput = z.infer<typeof bookingAssignmentConflictCheckSchema>;
export type BookingAssignmentProfileInput = z.infer<typeof bookingAssignmentProfileInputSchema>;
export type BookingAvailabilityExceptionInput = z.infer<typeof bookingAvailabilityExceptionInputSchema>;
export type BookingAvailabilityExceptionPatch = z.infer<typeof bookingAvailabilityExceptionPatchSchema>;
export type BookingServiceType = z.infer<typeof bookingServiceTypeSchema>;
