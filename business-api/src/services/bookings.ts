import { and, eq, isNull, or } from "drizzle-orm";

import { getOrm } from "../db/connection.js";
import { bookingAssignmentProfiles, bookingAvailabilityExceptions, bookings } from "../db/schema/index.js";
import { computeEmbeddingText, isBenignEmbeddingSyncError, upsertEmbedding } from "../lib/embeddings.js";
import { AppError } from "../lib/errors.js";
import { createPrefixedId } from "../lib/ids.js";
import { logger } from "../lib/logger.js";
import { createSlug } from "../lib/slug-ids.js";
import type {
  BookingAssignmentConflictCheckInput,
  BookingAssignmentProfileInput,
  BookingAvailabilityExceptionInput,
  BookingAvailabilityExceptionPatch,
  BookingCancelInput,
  BookingCompleteInput,
  BookingInput,
  BookingPatch,
  BookingServiceType,
} from "@warehouse-hub/business-schemas";
import { createTask } from "./tasks.js";
import {
  requireBookingRecord,
  requireCompanyCardRecord,
  requireContactRecord,
  requireDealRecord,
  requireProjectRecord,
  requireSalesInvoiceRecord,
  requireTaskRecord,
} from "./shared.js";

type BookingRecord = typeof bookings.$inferSelect;
type BookingAssignmentProfileRecord = typeof bookingAssignmentProfiles.$inferSelect;
type BookingAvailabilityExceptionRecord = typeof bookingAvailabilityExceptions.$inferSelect;
type WeeklyAvailability = BookingAssignmentProfileInput["weeklyAvailability"];
type AvailabilityExceptionKind = BookingAvailabilityExceptionInput["kind"];

type AssignmentConflict = {
  contactId: string;
  type: string;
  details: string;
  bookingId?: string;
};

const BLOCKING_BOOKING_STATUSES = new Set(["confirmed", "in_progress"]);
const MAX_BOOKINGS_PER_DAY_STATUSES = new Set(["tentative", "confirmed", "in_progress"]);

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function parseRoles(raw: string): string[] {
  return parseJson<string[]>(raw, []);
}

function toTimestamp(value: string, field: string): number {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new AppError(`Invalid ${field}: ${value}`, {
      statusCode: 400,
      code: "invalid_datetime",
      details: { field, value },
    });
  }

  return timestamp;
}

function assertValidWindow(startAt: string, endAt: string): void {
  if (toTimestamp(startAt, "scheduledStartAt") >= toTimestamp(endAt, "scheduledEndAt")) {
    throw new AppError("scheduledStartAt must be before scheduledEndAt", {
      statusCode: 400,
      code: "invalid_booking_window",
    });
  }
}

function assertValidExceptionWindow(startAt: string, endAt: string): void {
  if (toTimestamp(startAt, "startAt") >= toTimestamp(endAt, "endAt")) {
    throw new AppError("startAt must be before endAt", {
      statusCode: 400,
      code: "invalid_availability_exception_window",
    });
  }
}

function overlaps(startAt: string, endAt: string, otherStartAt: string, otherEndAt: string): boolean {
  return toTimestamp(startAt, "startAt") < toTimestamp(otherEndAt, "endAt")
    && toTimestamp(endAt, "endAt") > toTimestamp(otherStartAt, "startAt");
}

function addMinutes(value: string, minutes: number): string {
  return new Date(toTimestamp(value, "datetime") + minutes * 60_000).toISOString();
}

function formatLocalParts(value: string, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  });

  const parts = Object.fromEntries(formatter.formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    dayOfWeek: String(parts.weekday).toLowerCase(),
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function parseTime(value: string): number {
  const [hour, minute] = value.split(":").map((part) => Number.parseInt(part, 10));
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new AppError(`Invalid availability time: ${value}`, {
      statusCode: 400,
      code: "invalid_availability_window",
    });
  }

  return hour * 60 + minute;
}

function assertSameLocalDay(startAt: string, endAt: string, timezone: string): void {
  const start = formatLocalParts(startAt, timezone);
  const end = formatLocalParts(endAt, timezone);
  if (start.dateKey !== end.dateKey) {
    throw new AppError("Bookings must fit within one local calendar day for v1 availability validation", {
      statusCode: 400,
      code: "cross_day_booking",
      details: { timezone },
    });
  }
}

function hasRole(record: { roles: string }, role: string): boolean {
  return parseRoles(record.roles).includes(role);
}

function requireCustomerContact(contactId: string) {
  const customer = requireContactRecord(contactId);
  if (customer.status !== "active" || (!hasRole(customer, "customer") && !hasRole(customer, "both"))) {
    throw new AppError(`Booking customerContactId must be an active customer contact: ${contactId}`, {
      statusCode: 400,
      code: "invalid_booking_customer",
      details: { contactId },
    });
  }

  return customer;
}

function requireEmployeeContact(contactId: string) {
  const employee = requireContactRecord(contactId);
  if (employee.status !== "active" || employee.type !== "person" || !hasRole(employee, "employee")) {
    throw new AppError(`Assigned contact must be an active employee person contact: ${contactId}`, {
      statusCode: 400,
      code: "invalid_booking_employee",
      details: { contactId },
    });
  }

  return employee;
}

function validateRelationshipContext(data: {
  customerContactId: string;
  projectId?: string | null;
  dealId?: string | null;
  taskId?: string | null;
  salesInvoiceId?: string | null;
}): void {
  requireCustomerContact(data.customerContactId);

  let projectIdForTask: string | null = data.projectId ?? null;
  if (data.projectId) {
    const project = requireProjectRecord(data.projectId);
    if (project.ownerEntityType !== "contact" || project.ownerEntityId !== data.customerContactId) {
      throw new AppError("Booking project must belong to the booking customer contact", {
        statusCode: 400,
        code: "invalid_booking_project",
        details: {
          projectId: data.projectId,
          customerContactId: data.customerContactId,
        },
      });
    }
  }

  if (data.dealId) {
    const deal = requireDealRecord(data.dealId);
    if (deal.customerContactId !== data.customerContactId) {
      throw new AppError("Booking deal must belong to the booking customer contact", {
        statusCode: 400,
        code: "invalid_booking_deal",
        details: {
          dealId: data.dealId,
          customerContactId: data.customerContactId,
        },
      });
    }
  }

  if (data.salesInvoiceId) {
    const salesInvoice = requireSalesInvoiceRecord(data.salesInvoiceId);
    if (salesInvoice.customerContactId !== data.customerContactId) {
      throw new AppError("Booking sales invoice must belong to the booking customer contact", {
        statusCode: 400,
        code: "invalid_booking_sales_invoice",
        details: {
          salesInvoiceId: data.salesInvoiceId,
          customerContactId: data.customerContactId,
        },
      });
    }
    if (data.dealId && salesInvoice.dealId && salesInvoice.dealId !== data.dealId) {
      throw new AppError("Booking sales invoice deal must match the booking deal", {
        statusCode: 400,
        code: "invalid_booking_sales_invoice",
        details: {
          salesInvoiceId: data.salesInvoiceId,
          dealId: data.dealId,
        },
      });
    }
  }

  if (data.taskId) {
    const task = requireTaskRecord(data.taskId);
    if (projectIdForTask && task.projectId !== projectIdForTask) {
      throw new AppError("Booking task must belong to the booking project", {
        statusCode: 400,
        code: "invalid_booking_task",
        details: {
          taskId: data.taskId,
          projectId: projectIdForTask,
        },
      });
    }

    projectIdForTask = task.projectId;
    const taskProject = requireProjectRecord(task.projectId);
    if (taskProject.ownerEntityType !== "contact" || taskProject.ownerEntityId !== data.customerContactId) {
      throw new AppError("Booking task project must belong to the booking customer contact", {
        statusCode: 400,
        code: "invalid_booking_task",
        details: {
          taskId: data.taskId,
          customerContactId: data.customerContactId,
        },
      });
    }
  }
}

function mapBooking(record: BookingRecord) {
  return {
    bookingId: record.id,
    slug: record.slug,
    customerContactId: record.customerContactId,
    projectId: record.projectId,
    dealId: record.dealId,
    taskId: record.taskId,
    salesInvoiceId: record.salesInvoiceId,
    title: record.title,
    serviceType: record.serviceType,
    status: record.status,
    scheduledStartAt: record.scheduledStartAt,
    scheduledEndAt: record.scheduledEndAt,
    timezone: record.timezone,
    location: parseJson(record.location, null),
    assignedContactIds: parseJson<string[]>(record.assignedContactIds, []),
    notes: record.notes,
    completionNotes: record.completionNotes,
    completedAt: record.completedAt,
    cancelledAt: record.cancelledAt,
    cancellationReason: record.cancellationReason,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function mapAssignmentProfile(record: BookingAssignmentProfileRecord) {
  return {
    profileId: record.id,
    slug: record.slug,
    contactId: record.contactId,
    isBookable: Boolean(record.isBookable),
    timezone: record.timezone,
    weeklyAvailability: parseJson<WeeklyAvailability>(record.weeklyAvailability, []),
    bufferBeforeMinutes: record.bufferBeforeMinutes,
    bufferAfterMinutes: record.bufferAfterMinutes,
    maxBookingsPerDay: record.maxBookingsPerDay,
    bookingTypes: parseJson<BookingServiceType[] | null>(record.bookingTypes, null),
    effectiveFrom: record.effectiveFrom,
    effectiveTo: record.effectiveTo,
    notes: record.notes,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function mapAvailabilityException(record: BookingAvailabilityExceptionRecord) {
  return {
    exceptionId: record.id,
    slug: record.slug,
    contactId: record.contactId,
    kind: record.kind as AvailabilityExceptionKind,
    startAt: record.startAt,
    endAt: record.endAt,
    reason: record.reason,
    notes: record.notes,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function scheduleEmbedding(bookingId: string, payload: ReturnType<typeof getBooking>): void {
  void upsertEmbedding("booking", bookingId, computeEmbeddingText("booking", payload)).catch((error) => {
    if (isBenignEmbeddingSyncError(error)) {
      return;
    }
    logger.warn("Failed to sync booking embedding", { bookingId, error });
  });
}

function getProfileRecordByContactId(contactId: string, includeDeleted = false) {
  const conditions = [eq(bookingAssignmentProfiles.contactId, contactId)];
  if (!includeDeleted) {
    conditions.push(isNull(bookingAssignmentProfiles.deletedAt));
  }

  return getOrm().select().from(bookingAssignmentProfiles).where(and(...conditions)).get();
}

function requireProfileRecord(contactId: string) {
  const record = getProfileRecordByContactId(contactId);
  if (!record) {
    throw new AppError(`Booking assignment profile not found for contact: ${contactId}`, {
      statusCode: 404,
      code: "not_found",
    });
  }

  return record;
}

function getAvailabilityExceptionRecordByIdOrSlug(idOrSlug: string) {
  return getOrm()
    .select()
    .from(bookingAvailabilityExceptions)
    .where(
      and(
        isNull(bookingAvailabilityExceptions.deletedAt),
        or(eq(bookingAvailabilityExceptions.id, idOrSlug), eq(bookingAvailabilityExceptions.slug, idOrSlug)),
      ),
    )
    .get();
}

function requireAvailabilityExceptionRecord(idOrSlug: string) {
  const record = getAvailabilityExceptionRecordByIdOrSlug(idOrSlug);
  if (!record) {
    throw new AppError(`Booking availability exception not found: ${idOrSlug}`, {
      statusCode: 404,
      code: "not_found",
    });
  }

  return record;
}

function getEmployeeExceptions(contactId: string) {
  return getOrm()
    .select()
    .from(bookingAvailabilityExceptions)
    .where(and(isNull(bookingAvailabilityExceptions.deletedAt), eq(bookingAvailabilityExceptions.contactId, contactId)))
    .all();
}

function isCoveredByWeeklyAvailability(
  startAt: string,
  endAt: string,
  timezone: string,
  weeklyAvailability: WeeklyAvailability,
): boolean {
  const start = formatLocalParts(startAt, timezone);
  const end = formatLocalParts(endAt, timezone);
  if (start.dateKey !== end.dateKey) {
    return false;
  }

  const day = weeklyAvailability.find((entry) => entry.dayOfWeek === start.dayOfWeek);
  if (!day) {
    return false;
  }

  return day.windows.some((window) => {
    const windowStart = parseTime(window.start);
    const windowEnd = parseTime(window.end);
    return windowStart <= start.minutes && windowEnd >= end.minutes && windowStart < windowEnd;
  });
}

function isCoveredByAvailableOverride(startAt: string, endAt: string, exceptions: BookingAvailabilityExceptionRecord[]): boolean {
  const startMs = toTimestamp(startAt, "scheduledStartAt");
  const endMs = toTimestamp(endAt, "scheduledEndAt");
  return exceptions.some((exception) => {
    if (exception.kind !== "available_override") {
      return false;
    }

    return toTimestamp(exception.startAt, "startAt") <= startMs && toTimestamp(exception.endAt, "endAt") >= endMs;
  });
}

function getAssignedBookingsForContact(contactId: string, excludeBookingId?: string) {
  return getOrm()
    .select()
    .from(bookings)
    .where(isNull(bookings.deletedAt))
    .all()
    .filter((booking) => booking.id !== excludeBookingId)
    .filter((booking) => parseJson<string[]>(booking.assignedContactIds, []).includes(contactId));
}

function checkSingleAssignment(
  input: BookingAssignmentConflictCheckInput,
  contactId: string,
): AssignmentConflict[] {
  const conflicts: AssignmentConflict[] = [];
  requireEmployeeContact(contactId);

  const profile = getProfileRecordByContactId(contactId);
  if (!profile) {
    return [
      {
        contactId,
        type: "missing_assignment_profile",
        details: "Employee does not have a booking assignment profile.",
      },
    ];
  }

  const profileData = mapAssignmentProfile(profile);
  const startAt = addMinutes(input.scheduledStartAt, -(profileData.bufferBeforeMinutes ?? 0));
  const endAt = addMinutes(input.scheduledEndAt, profileData.bufferAfterMinutes ?? 0);
  const exceptions = getEmployeeExceptions(contactId);

  if (!profileData.isBookable) {
    conflicts.push({
      contactId,
      type: "not_bookable",
      details: "Employee is not marked as bookable.",
    });
  }

  if (profileData.bookingTypes && !profileData.bookingTypes.includes(input.serviceType)) {
    conflicts.push({
      contactId,
      type: "unsupported_booking_type",
      details: `Employee is not configured for booking type ${input.serviceType}.`,
    });
  }

  if (profileData.effectiveFrom && toTimestamp(input.scheduledStartAt, "scheduledStartAt") < toTimestamp(profileData.effectiveFrom, "effectiveFrom")) {
    conflicts.push({
      contactId,
      type: "profile_not_effective",
      details: "Employee booking profile is not effective yet.",
    });
  }

  if (profileData.effectiveTo && toTimestamp(input.scheduledEndAt, "scheduledEndAt") > toTimestamp(profileData.effectiveTo, "effectiveTo")) {
    conflicts.push({
      contactId,
      type: "profile_not_effective",
      details: "Employee booking profile is no longer effective.",
    });
  }

  const blockingException = exceptions.find(
    (exception) =>
      (exception.kind === "time_off" || exception.kind === "blocked")
      && overlaps(startAt, endAt, exception.startAt, exception.endAt),
  );
  if (blockingException) {
    conflicts.push({
      contactId,
      type: "availability_exception",
      details: `Employee is marked as ${blockingException.kind} during the requested slot.`,
    });
  }

  const weeklyAvailable = isCoveredByWeeklyAvailability(
    input.scheduledStartAt,
    input.scheduledEndAt,
    profileData.timezone,
    profileData.weeklyAvailability,
  );
  if (!weeklyAvailable && !isCoveredByAvailableOverride(input.scheduledStartAt, input.scheduledEndAt, exceptions)) {
    conflicts.push({
      contactId,
      type: "outside_weekly_availability",
      details: "Employee is not available during the requested slot.",
    });
  }

  const overlappingBooking = getAssignedBookingsForContact(contactId, input.bookingId).find(
    (booking) =>
      BLOCKING_BOOKING_STATUSES.has(booking.status)
      && overlaps(startAt, endAt, booking.scheduledStartAt, booking.scheduledEndAt),
  );
  if (overlappingBooking) {
    conflicts.push({
      contactId,
      bookingId: overlappingBooking.id,
      type: "overlapping_booking",
      details: "Employee already has an overlapping confirmed or in-progress booking.",
    });
  }

  if (profileData.maxBookingsPerDay) {
    const requestedDate = formatLocalParts(input.scheduledStartAt, profileData.timezone).dateKey;
    const bookingsOnDay = getAssignedBookingsForContact(contactId, input.bookingId).filter((booking) => {
      return MAX_BOOKINGS_PER_DAY_STATUSES.has(booking.status)
        && formatLocalParts(booking.scheduledStartAt, profileData.timezone).dateKey === requestedDate;
    });
    if (bookingsOnDay.length >= profileData.maxBookingsPerDay) {
      conflicts.push({
        contactId,
        type: "max_bookings_per_day",
        details: `Employee already has ${bookingsOnDay.length} bookings on ${requestedDate}.`,
      });
    }
  }

  return conflicts;
}

function assertNoAssignmentConflicts(input: BookingAssignmentConflictCheckInput): void {
  const conflicts = checkBookingAssignmentConflicts(input);
  if (conflicts.length > 0) {
    throw new AppError("One or more assigned employees are not available for this booking window.", {
      statusCode: 409,
      code: "booking_assignment_conflict",
      details: { conflicts },
    });
  }
}

function assertBookingTransition(fromStatus: string, toStatus: string): void {
  const allowedTransitions: Record<string, string[]> = {
    tentative: ["tentative", "confirmed", "cancelled"],
    confirmed: ["tentative", "confirmed", "in_progress", "completed", "cancelled", "no_show"],
    in_progress: ["in_progress", "completed", "cancelled", "no_show"],
    completed: ["completed"],
    cancelled: ["cancelled"],
    no_show: ["no_show"],
  };

  if (!allowedTransitions[fromStatus]?.includes(toStatus)) {
    throw new AppError(`Invalid booking status transition: ${fromStatus} -> ${toStatus}`, {
      statusCode: 409,
      code: "invalid_status_transition",
    });
  }
}

export function checkBookingAssignmentConflicts(input: BookingAssignmentConflictCheckInput): AssignmentConflict[] {
  assertValidWindow(input.scheduledStartAt, input.scheduledEndAt);
  assertSameLocalDay(input.scheduledStartAt, input.scheduledEndAt, input.timezone);

  return input.assignedContactIds.flatMap((contactId) => checkSingleAssignment(input, contactId));
}

export function createBooking(data: BookingInput) {
  const company = requireCompanyCardRecord();
  assertValidWindow(data.scheduledStartAt, data.scheduledEndAt);
  assertSameLocalDay(data.scheduledStartAt, data.scheduledEndAt, data.timezone);
  validateRelationshipContext(data);
  data.assignedContactIds.forEach(requireEmployeeContact);
  if (data.assignedContactIds.length > 0) {
    assertNoAssignmentConflicts({
      serviceType: data.serviceType,
      scheduledStartAt: data.scheduledStartAt,
      scheduledEndAt: data.scheduledEndAt,
      timezone: data.timezone,
      assignedContactIds: data.assignedContactIds,
    });
  }

  const id = createPrefixedId("book_");
  const now = new Date().toISOString();
  getOrm()
    .insert(bookings)
    .values({
      id,
      slug: createSlug(`${data.customerContactId}:${data.title}:${id}`),
      companyCardId: company.id,
      customerContactId: data.customerContactId,
      projectId: data.projectId ?? null,
      dealId: data.dealId ?? null,
      taskId: data.taskId ?? null,
      salesInvoiceId: data.salesInvoiceId ?? null,
      title: data.title,
      serviceType: data.serviceType,
      status: data.status,
      scheduledStartAt: data.scheduledStartAt,
      scheduledEndAt: data.scheduledEndAt,
      timezone: data.timezone,
      location: data.location ? JSON.stringify(data.location) : null,
      assignedContactIds: JSON.stringify(data.assignedContactIds),
      notes: data.notes ?? null,
      completionNotes: null,
      completedAt: null,
      cancelledAt: data.status === "cancelled" ? now : null,
      cancellationReason: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    .run();

  const created = getBooking(id);
  scheduleEmbedding(id, created);
  return created;
}

export function listBookings(filters: {
  from?: string;
  to?: string;
  status?: string;
  customerContactId?: string;
  assignedContactId?: string;
  projectId?: string;
  dealId?: string;
} = {}) {
  const conditions = [isNull(bookings.deletedAt)];
  if (filters.status) {
    conditions.push(eq(bookings.status, filters.status));
  }
  if (filters.customerContactId) {
    conditions.push(eq(bookings.customerContactId, filters.customerContactId));
  }
  if (filters.projectId) {
    conditions.push(eq(bookings.projectId, filters.projectId));
  }
  if (filters.dealId) {
    conditions.push(eq(bookings.dealId, filters.dealId));
  }

  const fromMs = filters.from ? toTimestamp(filters.from, "from") : undefined;
  const toMs = filters.to ? toTimestamp(filters.to, "to") : undefined;

  return getOrm()
    .select()
    .from(bookings)
    .where(and(...conditions))
    .all()
    .filter((booking) => !filters.assignedContactId || parseJson<string[]>(booking.assignedContactIds, []).includes(filters.assignedContactId))
    .filter((booking) => fromMs === undefined || toTimestamp(booking.scheduledEndAt, "scheduledEndAt") > fromMs)
    .filter((booking) => toMs === undefined || toTimestamp(booking.scheduledStartAt, "scheduledStartAt") < toMs)
    .sort((left, right) => toTimestamp(left.scheduledStartAt, "scheduledStartAt") - toTimestamp(right.scheduledStartAt, "scheduledStartAt"))
    .map(mapBooking);
}

export function getBooking(idOrSlug: string) {
  return mapBooking(requireBookingRecord(idOrSlug));
}

export function updateBooking(idOrSlug: string, patch: BookingPatch) {
  const existing = requireBookingRecord(idOrSlug);
  if (patch.status) {
    assertBookingTransition(existing.status, patch.status);
  }

  const next = {
    customerContactId: patch.customerContactId ?? existing.customerContactId,
    projectId: patch.projectId !== undefined ? patch.projectId : existing.projectId,
    dealId: patch.dealId !== undefined ? patch.dealId : existing.dealId,
    taskId: patch.taskId !== undefined ? patch.taskId : existing.taskId,
    salesInvoiceId: patch.salesInvoiceId !== undefined ? patch.salesInvoiceId : existing.salesInvoiceId,
    title: patch.title ?? existing.title,
    serviceType: patch.serviceType ?? (existing.serviceType as BookingServiceType),
    status: patch.status ?? existing.status,
    scheduledStartAt: patch.scheduledStartAt ?? existing.scheduledStartAt,
    scheduledEndAt: patch.scheduledEndAt ?? existing.scheduledEndAt,
    timezone: patch.timezone ?? existing.timezone,
    location: patch.location !== undefined ? patch.location : parseJson(existing.location, null),
    assignedContactIds: patch.assignedContactIds ?? parseJson<string[]>(existing.assignedContactIds, []),
    notes: patch.notes !== undefined ? patch.notes : existing.notes,
    completionNotes: patch.completionNotes !== undefined ? patch.completionNotes : existing.completionNotes,
  };

  assertValidWindow(next.scheduledStartAt, next.scheduledEndAt);
  assertSameLocalDay(next.scheduledStartAt, next.scheduledEndAt, next.timezone);
  validateRelationshipContext(next);
  next.assignedContactIds.forEach(requireEmployeeContact);
  if (next.assignedContactIds.length > 0) {
    assertNoAssignmentConflicts({
      bookingId: existing.id,
      serviceType: next.serviceType,
      scheduledStartAt: next.scheduledStartAt,
      scheduledEndAt: next.scheduledEndAt,
      timezone: next.timezone,
      assignedContactIds: next.assignedContactIds,
    });
  }

  getOrm()
    .update(bookings)
    .set({
      customerContactId: next.customerContactId,
      projectId: next.projectId,
      dealId: next.dealId,
      taskId: next.taskId,
      salesInvoiceId: next.salesInvoiceId,
      title: next.title,
      serviceType: next.serviceType,
      status: next.status,
      scheduledStartAt: next.scheduledStartAt,
      scheduledEndAt: next.scheduledEndAt,
      timezone: next.timezone,
      location: next.location ? JSON.stringify(next.location) : null,
      assignedContactIds: JSON.stringify(next.assignedContactIds),
      notes: next.notes,
      completionNotes: next.completionNotes,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(bookings.id, existing.id))
    .run();

  const updated = getBooking(existing.id);
  scheduleEmbedding(existing.id, updated);
  return updated;
}

export function completeBooking(idOrSlug: string, data: BookingCompleteInput) {
  const existing = requireBookingRecord(idOrSlug);
  assertBookingTransition(existing.status, "completed");
  const now = new Date().toISOString();
  let followUpTaskId: string | null = null;

  if (data.createFollowUpTask) {
    if (!existing.projectId) {
      throw new AppError("A booking must have projectId to create a follow-up task", {
        statusCode: 400,
        code: "missing_booking_project",
      });
    }

    const task = createTask({
      projectId: existing.projectId,
      title: data.followUpTaskTitle ?? `Follow up: ${existing.title}`,
      description: data.completionNotes ?? existing.notes ?? undefined,
      status: "open",
      priority: "medium",
      dueDate: existing.scheduledEndAt.slice(0, 10),
    });
    followUpTaskId = task.taskId;
  }

  getOrm()
    .update(bookings)
    .set({
      status: "completed",
      completionNotes: data.completionNotes ?? existing.completionNotes,
      completedAt: now,
      taskId: followUpTaskId ?? existing.taskId,
      updatedAt: now,
    })
    .where(eq(bookings.id, existing.id))
    .run();

  const updated = getBooking(existing.id);
  scheduleEmbedding(existing.id, updated);
  return {
    ...updated,
    followUpTaskId,
  };
}

export function cancelBooking(idOrSlug: string, data: BookingCancelInput) {
  const existing = requireBookingRecord(idOrSlug);
  assertBookingTransition(existing.status, "cancelled");
  const now = new Date().toISOString();
  getOrm()
    .update(bookings)
    .set({
      status: "cancelled",
      cancelledAt: now,
      cancellationReason: data.reason,
      updatedAt: now,
    })
    .where(eq(bookings.id, existing.id))
    .run();

  const updated = getBooking(existing.id);
  scheduleEmbedding(existing.id, updated);
  return updated;
}

export function softDeleteBooking(idOrSlug: string) {
  const existing = requireBookingRecord(idOrSlug);
  getOrm()
    .update(bookings)
    .set({
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(bookings.id, existing.id))
    .run();
}

export function upsertBookingAssignmentProfile(contactId: string, data: BookingAssignmentProfileInput) {
  requireEmployeeContact(contactId);
  const existing = getProfileRecordByContactId(contactId, true);
  const now = new Date().toISOString();

  if (existing) {
    getOrm()
      .update(bookingAssignmentProfiles)
      .set({
        isBookable: data.isBookable,
        timezone: data.timezone,
        weeklyAvailability: JSON.stringify(data.weeklyAvailability),
        bufferBeforeMinutes: data.bufferBeforeMinutes ?? null,
        bufferAfterMinutes: data.bufferAfterMinutes ?? null,
        maxBookingsPerDay: data.maxBookingsPerDay ?? null,
        bookingTypes: data.bookingTypes ? JSON.stringify(data.bookingTypes) : null,
        effectiveFrom: data.effectiveFrom ?? null,
        effectiveTo: data.effectiveTo ?? null,
        notes: data.notes ?? null,
        updatedAt: now,
        deletedAt: null,
      })
      .where(eq(bookingAssignmentProfiles.id, existing.id))
      .run();

    return getBookingAssignmentProfile(contactId);
  }

  const id = createPrefixedId("bprof_");
  getOrm()
    .insert(bookingAssignmentProfiles)
    .values({
      id,
      slug: createSlug(`${contactId}:booking-profile:${id}`),
      contactId,
      isBookable: data.isBookable,
      timezone: data.timezone,
      weeklyAvailability: JSON.stringify(data.weeklyAvailability),
      bufferBeforeMinutes: data.bufferBeforeMinutes ?? null,
      bufferAfterMinutes: data.bufferAfterMinutes ?? null,
      maxBookingsPerDay: data.maxBookingsPerDay ?? null,
      bookingTypes: data.bookingTypes ? JSON.stringify(data.bookingTypes) : null,
      effectiveFrom: data.effectiveFrom ?? null,
      effectiveTo: data.effectiveTo ?? null,
      notes: data.notes ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    .run();

  return getBookingAssignmentProfile(contactId);
}

export function listBookingAssignmentProfiles() {
  return getOrm()
    .select()
    .from(bookingAssignmentProfiles)
    .where(isNull(bookingAssignmentProfiles.deletedAt))
    .all()
    .map(mapAssignmentProfile);
}

export function getBookingAssignmentProfile(contactId: string) {
  return mapAssignmentProfile(requireProfileRecord(contactId));
}

export function softDeleteBookingAssignmentProfile(contactId: string) {
  const existing = requireProfileRecord(contactId);
  getOrm()
    .update(bookingAssignmentProfiles)
    .set({
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(bookingAssignmentProfiles.id, existing.id))
    .run();
}

export function createBookingAvailabilityException(data: BookingAvailabilityExceptionInput) {
  requireEmployeeContact(data.contactId);
  assertValidExceptionWindow(data.startAt, data.endAt);
  const id = createPrefixedId("bex_");
  const now = new Date().toISOString();

  getOrm()
    .insert(bookingAvailabilityExceptions)
    .values({
      id,
      slug: createSlug(`${data.contactId}:${data.kind}:${data.startAt}:${id}`),
      contactId: data.contactId,
      kind: data.kind,
      startAt: data.startAt,
      endAt: data.endAt,
      reason: data.reason ?? null,
      notes: data.notes ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    .run();

  return getBookingAvailabilityException(id);
}

export function listBookingAvailabilityExceptions(filters: { contactId?: string; kind?: string } = {}) {
  const conditions = [isNull(bookingAvailabilityExceptions.deletedAt)];
  if (filters.contactId) {
    conditions.push(eq(bookingAvailabilityExceptions.contactId, filters.contactId));
  }
  if (filters.kind) {
    conditions.push(eq(bookingAvailabilityExceptions.kind, filters.kind));
  }

  return getOrm()
    .select()
    .from(bookingAvailabilityExceptions)
    .where(and(...conditions))
    .all()
    .map(mapAvailabilityException);
}

export function getBookingAvailabilityException(idOrSlug: string) {
  return mapAvailabilityException(requireAvailabilityExceptionRecord(idOrSlug));
}

export function updateBookingAvailabilityException(idOrSlug: string, patch: BookingAvailabilityExceptionPatch) {
  const existing = requireAvailabilityExceptionRecord(idOrSlug);
  const next = {
    kind: patch.kind ?? (existing.kind as AvailabilityExceptionKind),
    startAt: patch.startAt ?? existing.startAt,
    endAt: patch.endAt ?? existing.endAt,
    reason: patch.reason !== undefined ? patch.reason : existing.reason,
    notes: patch.notes !== undefined ? patch.notes : existing.notes,
  };

  assertValidExceptionWindow(next.startAt, next.endAt);
  getOrm()
    .update(bookingAvailabilityExceptions)
    .set({
      kind: next.kind,
      startAt: next.startAt,
      endAt: next.endAt,
      reason: next.reason,
      notes: next.notes,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(bookingAvailabilityExceptions.id, existing.id))
    .run();

  return getBookingAvailabilityException(existing.id);
}

export function softDeleteBookingAvailabilityException(idOrSlug: string) {
  const existing = requireAvailabilityExceptionRecord(idOrSlug);
  getOrm()
    .update(bookingAvailabilityExceptions)
    .set({
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(bookingAvailabilityExceptions.id, existing.id))
    .run();
}
