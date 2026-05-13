import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetTestState, restoreServiceTestEnvironment, setupDefaultCompanyCard } from "./helpers/services.js";

describe("business-api booking service flows", () => {
  beforeEach(async () => {
    await resetTestState();
    await setupDefaultCompanyCard();
  });

  afterEach(async () => {
    await restoreServiceTestEnvironment();
  });

  async function createBookingFixture() {
    const { createContact } = await import("../src/services/contacts.js");
    const { createProject } = await import("../src/services/projects.js");
    const { upsertBookingAssignmentProfile } = await import("../src/services/bookings.js");

    const customer = createContact({
      type: "company",
      status: "active",
      roles: ["customer"],
      displayName: "Acme Retail GmbH",
      legalName: "Acme Retail GmbH",
    });
    const employee = createContact({
      type: "person",
      status: "active",
      roles: ["employee"],
      displayName: "Marta Field",
      email: "marta@example.com",
    });
    const project = createProject({
      ownerEntityId: customer.contactId,
      ownerEntityType: "contact",
      name: "Acme site visits",
      status: "active",
    });

    upsertBookingAssignmentProfile(employee.contactId, {
      isBookable: true,
      timezone: "Europe/Madrid",
      weeklyAvailability: [
        {
          dayOfWeek: "tuesday",
          windows: [{ start: "09:00", end: "17:00" }],
        },
      ],
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      maxBookingsPerDay: 3,
      bookingTypes: ["visit", "maintenance"],
    });

    return { customer, employee, project };
  }

  it("creates, completes, comments on, and cancels bookings", async () => {
    const { createBooking, cancelBooking, completeBooking, getBooking } = await import("../src/services/bookings.js");
    const { createComment, listComments } = await import("../src/services/comments.js");
    const { getTask } = await import("../src/services/tasks.js");
    const { customer, employee, project } = await createBookingFixture();

    const booking = createBooking({
      customerContactId: customer.contactId,
      projectId: project.projectId,
      title: "Warehouse automation discovery visit",
      serviceType: "visit",
      status: "confirmed",
      scheduledStartAt: "2026-04-07T09:00:00+02:00",
      scheduledEndAt: "2026-04-07T10:00:00+02:00",
      timezone: "Europe/Madrid",
      assignedContactIds: [employee.contactId],
      notes: "Customer requested packing-line review.",
    });

    expect(booking.bookingId).toMatch(/^book_/);
    expect(booking.assignedContactIds).toEqual([employee.contactId]);

    const comment = createComment({
      commentableType: "booking",
      commentableId: booking.bookingId,
      body: "Bring a measuring tape.",
      authorName: "Operations agent",
    });
    expect(listComments({ commentableType: "booking", commentableId: booking.bookingId })).toEqual([
      expect.objectContaining({ commentId: comment.commentId }),
    ]);

    const completed = completeBooking(booking.bookingId, {
      completionNotes: "Site survey completed.",
      createFollowUpTask: true,
    });
    expect(completed.status).toBe("completed");
    expect(completed.completedAt).toEqual(expect.any(String));
    expect(completed.followUpTaskId).toMatch(/^task_/);
    expect(getTask(completed.followUpTaskId!)).toEqual(
      expect.objectContaining({
        title: "Follow up: Warehouse automation discovery visit",
      }),
    );

    const cancellable = createBooking({
      customerContactId: customer.contactId,
      projectId: project.projectId,
      title: "Maintenance slot",
      serviceType: "maintenance",
      status: "tentative",
      scheduledStartAt: "2026-04-07T11:00:00+02:00",
      scheduledEndAt: "2026-04-07T12:00:00+02:00",
      timezone: "Europe/Madrid",
      assignedContactIds: [employee.contactId],
    });
    const cancelled = cancelBooking(cancellable.bookingId, { reason: "customer_requested_reschedule" });
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.cancelledAt).toEqual(expect.any(String));
    expect(cancelled.cancellationReason).toBe("customer_requested_reschedule");
    expect(getBooking(cancelled.bookingId)).toEqual(expect.objectContaining({ status: "cancelled" }));
  });

  it("blocks invalid employee assignments and permits available overrides", async () => {
    const {
      createBooking,
      createBookingAvailabilityException,
      upsertBookingAssignmentProfile,
    } = await import("../src/services/bookings.js");
    const { createContact } = await import("../src/services/contacts.js");
    const { customer, employee, project } = await createBookingFixture();

    createBooking({
      customerContactId: customer.contactId,
      projectId: project.projectId,
      title: "Morning visit",
      serviceType: "visit",
      status: "confirmed",
      scheduledStartAt: "2026-04-07T10:00:00+02:00",
      scheduledEndAt: "2026-04-07T11:00:00+02:00",
      timezone: "Europe/Madrid",
      assignedContactIds: [employee.contactId],
    });

    expect(() =>
      createBooking({
        customerContactId: customer.contactId,
        projectId: project.projectId,
        title: "Overlapping visit",
        serviceType: "visit",
        status: "confirmed",
        scheduledStartAt: "2026-04-07T10:30:00+02:00",
        scheduledEndAt: "2026-04-07T11:30:00+02:00",
        timezone: "Europe/Madrid",
        assignedContactIds: [employee.contactId],
      }),
    ).toThrow(/not available/);

    expect(() =>
      createBooking({
        customerContactId: customer.contactId,
        projectId: project.projectId,
        title: "Outside hours",
        serviceType: "visit",
        status: "confirmed",
        scheduledStartAt: "2026-04-07T18:00:00+02:00",
        scheduledEndAt: "2026-04-07T19:00:00+02:00",
        timezone: "Europe/Madrid",
        assignedContactIds: [employee.contactId],
      }),
    ).toThrow(/not available/);

    createBookingAvailabilityException({
      contactId: employee.contactId,
      kind: "blocked",
      startAt: "2026-04-07T12:00:00+02:00",
      endAt: "2026-04-07T13:00:00+02:00",
      reason: "training",
    });
    expect(() =>
      createBooking({
        customerContactId: customer.contactId,
        projectId: project.projectId,
        title: "Blocked visit",
        serviceType: "visit",
        status: "confirmed",
        scheduledStartAt: "2026-04-07T12:15:00+02:00",
        scheduledEndAt: "2026-04-07T12:45:00+02:00",
        timezone: "Europe/Madrid",
        assignedContactIds: [employee.contactId],
      }),
    ).toThrow(/not available/);

    const noProfileEmployee = createContact({
      type: "person",
      status: "active",
      roles: ["employee"],
      displayName: "No Profile",
    });
    expect(() =>
      createBooking({
        customerContactId: customer.contactId,
        projectId: project.projectId,
        title: "No profile",
        serviceType: "visit",
        status: "confirmed",
        scheduledStartAt: "2026-04-07T14:00:00+02:00",
        scheduledEndAt: "2026-04-07T15:00:00+02:00",
        timezone: "Europe/Madrid",
        assignedContactIds: [noProfileEmployee.contactId],
      }),
    ).toThrow(/not available/);

    upsertBookingAssignmentProfile(noProfileEmployee.contactId, {
      isBookable: true,
      timezone: "Europe/Madrid",
      weeklyAvailability: [],
      bookingTypes: ["visit"],
    });
    createBookingAvailabilityException({
      contactId: noProfileEmployee.contactId,
      kind: "available_override",
      startAt: "2026-04-07T15:00:00+02:00",
      endAt: "2026-04-07T16:00:00+02:00",
    });
    expect(
      createBooking({
        customerContactId: customer.contactId,
        projectId: project.projectId,
        title: "Override visit",
        serviceType: "visit",
        status: "confirmed",
        scheduledStartAt: "2026-04-07T15:00:00+02:00",
        scheduledEndAt: "2026-04-07T16:00:00+02:00",
        timezone: "Europe/Madrid",
        assignedContactIds: [noProfileEmployee.contactId],
      }),
    ).toEqual(expect.objectContaining({ title: "Override visit" }));
  });

  it("enforces customer context for related booking objects", async () => {
    const { createBooking } = await import("../src/services/bookings.js");
    const { createContact } = await import("../src/services/contacts.js");
    const { createDeal } = await import("../src/services/deals.js");
    const { createProject } = await import("../src/services/projects.js");
    const { generateSalesInvoice } = await import("../src/services/sales-invoices.js");
    const { createTask } = await import("../src/services/tasks.js");
    const { customer, employee, project } = await createBookingFixture();
    const otherCustomer = createContact({
      type: "company",
      status: "active",
      roles: ["customer"],
      displayName: "Other Customer SL",
    });
    const otherProject = createProject({
      ownerEntityId: otherCustomer.contactId,
      ownerEntityType: "contact",
      name: "Other project",
      status: "active",
    });
    const otherDeal = createDeal({
      customerContactId: otherCustomer.contactId,
      title: "Other deal",
      stage: "qualified",
      currency: "EUR",
      lineItems: [{ description: "Audit", quantity: "1", unitPrice: "100.00" }],
    });
    const otherInvoice = generateSalesInvoice({
      customerContactId: otherCustomer.contactId,
      issueDate: "2026-04-02",
      paymentTermsDays: 30,
      invoiceNumberStrategy: "next",
    });
    const otherTask = createTask({
      projectId: otherProject.projectId,
      title: "Other task",
      status: "open",
      priority: "medium",
    });

    const base = {
      customerContactId: customer.contactId,
      projectId: project.projectId,
      title: "Bad linked booking",
      serviceType: "visit" as const,
      status: "confirmed" as const,
      scheduledStartAt: "2026-04-07T13:00:00+02:00",
      scheduledEndAt: "2026-04-07T14:00:00+02:00",
      timezone: "Europe/Madrid",
      assignedContactIds: [employee.contactId],
    };

    expect(() => createBooking({ ...base, dealId: otherDeal.dealId })).toThrow(/deal must belong/i);
    expect(() => createBooking({ ...base, projectId: otherProject.projectId })).toThrow(/project must belong/i);
    expect(() => createBooking({ ...base, salesInvoiceId: otherInvoice.salesInvoiceId })).toThrow(/sales invoice must belong/i);
    expect(() => createBooking({ ...base, taskId: otherTask.taskId })).toThrow(/task must belong/i);
  });
});
