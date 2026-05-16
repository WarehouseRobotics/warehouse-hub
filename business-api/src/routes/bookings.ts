import { Router } from "express";

import { requireScope } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import {
  bookingAssignmentConflictCheckSchema,
  bookingAssignmentProfileInputSchema,
  bookingAvailabilityExceptionInputSchema,
  bookingAvailabilityExceptionPatchSchema,
  bookingCancelSchema,
  bookingCompleteSchema,
  bookingInputSchema,
  bookingPatchSchema,
} from "@warehouse-hub/business-schemas";
import {
  cancelBooking,
  checkBookingAssignmentConflicts,
  completeBooking,
  createBooking,
  createBookingAvailabilityException,
  getBooking,
  getBookingAssignmentProfile,
  getBookingAvailabilityException,
  listBookingAssignmentProfiles,
  listBookingAvailabilityExceptions,
  listBookings,
  softDeleteBooking,
  softDeleteBookingAssignmentProfile,
  softDeleteBookingAvailabilityException,
  updateBooking,
  updateBookingAvailabilityException,
  upsertBookingAssignmentProfile,
} from "../services/bookings.js";

export const bookingsRouter = Router();
export const bookingAssignmentProfilesRouter = Router();
export const bookingAvailabilityExceptionsRouter = Router();

function getRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

bookingsRouter.get("/", requireScope("read"), (request, response) => {
  response.json(
    listBookings({
      from: typeof request.query.from === "string" ? request.query.from : undefined,
      to: typeof request.query.to === "string" ? request.query.to : undefined,
      status: typeof request.query.status === "string" ? request.query.status : undefined,
      customerContactId:
        typeof request.query.customerContactId === "string" ? request.query.customerContactId : undefined,
      assignedContactId:
        typeof request.query.assignedContactId === "string" ? request.query.assignedContactId : undefined,
      projectId: typeof request.query.projectId === "string" ? request.query.projectId : undefined,
      dealId: typeof request.query.dealId === "string" ? request.query.dealId : undefined,
    }),
  );
});

bookingsRouter.post("/", requireScope("write"), validateBody(bookingInputSchema), (request, response) => {
  const booking = createBooking(request.body);
  response.locals.audit = {
    action: "booking.create",
    objectType: "booking",
    objectId: booking.bookingId,
  };
  response.status(201).json(booking);
});

bookingsRouter.post(
  "/check-assignment-conflicts",
  requireScope("write"),
  validateBody(bookingAssignmentConflictCheckSchema),
  (request, response) => {
    response.json({
      conflicts: checkBookingAssignmentConflicts(request.body),
    });
  },
);

bookingsRouter.get("/:id", requireScope("read"), (request, response) => {
  response.json(getBooking(getRouteParam(request.params.id)));
});

bookingsRouter.patch("/:id", requireScope("write"), validateBody(bookingPatchSchema), (request, response) => {
  const booking = updateBooking(getRouteParam(request.params.id), request.body);
  response.locals.audit = {
    action: "booking.update",
    objectType: "booking",
    objectId: booking.bookingId,
  };
  response.json(booking);
});

bookingsRouter.delete("/:id", requireScope("write"), (request, response) => {
  const id = getRouteParam(request.params.id);
  const booking = getBooking(id);
  softDeleteBooking(id);
  response.locals.audit = {
    action: "booking.delete",
    objectType: "booking",
    objectId: booking.bookingId,
  };
  response.status(204).send();
});

bookingsRouter.post("/:id/complete", requireScope("write"), validateBody(bookingCompleteSchema), (request, response) => {
  const booking = completeBooking(getRouteParam(request.params.id), request.body);
  response.locals.audit = {
    action: "booking.complete",
    objectType: "booking",
    objectId: booking.bookingId,
    metadata: {
      followUpTaskId: booking.followUpTaskId,
    },
  };
  response.json(booking);
});

bookingsRouter.post("/:id/cancel", requireScope("write"), validateBody(bookingCancelSchema), (request, response) => {
  const booking = cancelBooking(getRouteParam(request.params.id), request.body);
  response.locals.audit = {
    action: "booking.cancel",
    objectType: "booking",
    objectId: booking.bookingId,
  };
  response.json(booking);
});

bookingAssignmentProfilesRouter.get("/", requireScope("read"), (_request, response) => {
  response.json(listBookingAssignmentProfiles());
});

bookingAssignmentProfilesRouter.get("/:contactId", requireScope("read"), (request, response) => {
  response.json(getBookingAssignmentProfile(getRouteParam(request.params.contactId)));
});

bookingAssignmentProfilesRouter.put("/:contactId", requireScope("write"), validateBody(bookingAssignmentProfileInputSchema), (request, response) => {
  const profile = upsertBookingAssignmentProfile(getRouteParam(request.params.contactId), request.body);
  response.locals.audit = {
    action: "booking_assignment_profile.upsert",
    objectType: "booking_assignment_profile",
    objectId: profile.profileId,
  };
  response.json(profile);
});

bookingAssignmentProfilesRouter.delete("/:contactId", requireScope("write"), (request, response) => {
  const contactId = getRouteParam(request.params.contactId);
  const profile = getBookingAssignmentProfile(contactId);
  softDeleteBookingAssignmentProfile(contactId);
  response.locals.audit = {
    action: "booking_assignment_profile.delete",
    objectType: "booking_assignment_profile",
    objectId: profile.profileId,
  };
  response.status(204).send();
});

bookingAvailabilityExceptionsRouter.get("/", requireScope("read"), (request, response) => {
  response.json(
    listBookingAvailabilityExceptions({
      contactId: typeof request.query.contactId === "string" ? request.query.contactId : undefined,
      kind: typeof request.query.kind === "string" ? request.query.kind : undefined,
    }),
  );
});

bookingAvailabilityExceptionsRouter.post("/", requireScope("write"), validateBody(bookingAvailabilityExceptionInputSchema), (request, response) => {
  const exception = createBookingAvailabilityException(request.body);
  response.locals.audit = {
    action: "booking_availability_exception.create",
    objectType: "booking_availability_exception",
    objectId: exception.exceptionId,
  };
  response.status(201).json(exception);
});

bookingAvailabilityExceptionsRouter.get("/:id", requireScope("read"), (request, response) => {
  response.json(getBookingAvailabilityException(getRouteParam(request.params.id)));
});

bookingAvailabilityExceptionsRouter.patch("/:id", requireScope("write"), validateBody(bookingAvailabilityExceptionPatchSchema), (request, response) => {
  const exception = updateBookingAvailabilityException(getRouteParam(request.params.id), request.body);
  response.locals.audit = {
    action: "booking_availability_exception.update",
    objectType: "booking_availability_exception",
    objectId: exception.exceptionId,
  };
  response.json(exception);
});

bookingAvailabilityExceptionsRouter.delete("/:id", requireScope("write"), (request, response) => {
  const id = getRouteParam(request.params.id);
  const exception = getBookingAvailabilityException(id);
  softDeleteBookingAvailabilityException(id);
  response.locals.audit = {
    action: "booking_availability_exception.delete",
    objectType: "booking_availability_exception",
    objectId: exception.exceptionId,
  };
  response.status(204).send();
});
