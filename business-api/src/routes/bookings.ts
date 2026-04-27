import { Router } from "express";

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

bookingsRouter.get("/", (request, response) => {
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

bookingsRouter.post("/", validateBody(bookingInputSchema), (request, response) => {
  response.status(201).json(createBooking(request.body));
});

bookingsRouter.post(
  "/check-assignment-conflicts",
  validateBody(bookingAssignmentConflictCheckSchema),
  (request, response) => {
    response.json({
      conflicts: checkBookingAssignmentConflicts(request.body),
    });
  },
);

bookingsRouter.get("/:id", (request, response) => {
  response.json(getBooking(getRouteParam(request.params.id)));
});

bookingsRouter.patch("/:id", validateBody(bookingPatchSchema), (request, response) => {
  response.json(updateBooking(getRouteParam(request.params.id), request.body));
});

bookingsRouter.delete("/:id", (request, response) => {
  softDeleteBooking(getRouteParam(request.params.id));
  response.status(204).send();
});

bookingsRouter.post("/:id/complete", validateBody(bookingCompleteSchema), (request, response) => {
  response.json(completeBooking(getRouteParam(request.params.id), request.body));
});

bookingsRouter.post("/:id/cancel", validateBody(bookingCancelSchema), (request, response) => {
  response.json(cancelBooking(getRouteParam(request.params.id), request.body));
});

bookingAssignmentProfilesRouter.get("/", (_request, response) => {
  response.json(listBookingAssignmentProfiles());
});

bookingAssignmentProfilesRouter.get("/:contactId", (request, response) => {
  response.json(getBookingAssignmentProfile(getRouteParam(request.params.contactId)));
});

bookingAssignmentProfilesRouter.put("/:contactId", validateBody(bookingAssignmentProfileInputSchema), (request, response) => {
  response.json(upsertBookingAssignmentProfile(getRouteParam(request.params.contactId), request.body));
});

bookingAssignmentProfilesRouter.delete("/:contactId", (request, response) => {
  softDeleteBookingAssignmentProfile(getRouteParam(request.params.contactId));
  response.status(204).send();
});

bookingAvailabilityExceptionsRouter.get("/", (request, response) => {
  response.json(
    listBookingAvailabilityExceptions({
      contactId: typeof request.query.contactId === "string" ? request.query.contactId : undefined,
      kind: typeof request.query.kind === "string" ? request.query.kind : undefined,
    }),
  );
});

bookingAvailabilityExceptionsRouter.post("/", validateBody(bookingAvailabilityExceptionInputSchema), (request, response) => {
  response.status(201).json(createBookingAvailabilityException(request.body));
});

bookingAvailabilityExceptionsRouter.get("/:id", (request, response) => {
  response.json(getBookingAvailabilityException(getRouteParam(request.params.id)));
});

bookingAvailabilityExceptionsRouter.patch("/:id", validateBody(bookingAvailabilityExceptionPatchSchema), (request, response) => {
  response.json(updateBookingAvailabilityException(getRouteParam(request.params.id), request.body));
});

bookingAvailabilityExceptionsRouter.delete("/:id", (request, response) => {
  softDeleteBookingAvailabilityException(getRouteParam(request.params.id));
  response.status(204).send();
});
