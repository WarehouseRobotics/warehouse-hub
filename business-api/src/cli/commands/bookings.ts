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
} from "../../services/bookings.js";
import {
  parseFlexibleFlagArgs,
  parseJsonArg,
  parseNumberOption,
  throwUnknownCommand,
  type CliCommandDefinition,
} from "../core.js";

function parseBookingLocation(options: Record<string, string>) {
  if (!options["location-kind"]) {
    return undefined;
  }

  return {
    kind: options["location-kind"],
    label: options["location-label"],
    address: options["street1"] || options.city || options["postal-code"] || options.country
      ? {
          street1: options["street1"],
          street2: options["street2"],
          city: options.city,
          postalCode: options["postal-code"],
          countryCode: options.country,
        }
      : undefined,
    remoteUrl: options["remote-url"],
    notes: options["location-notes"],
  };
}

function parseBookingInputArg(args: string[]) {
  if (args[0]?.trim().startsWith("{")) {
    return bookingInputSchema.parse(parseJsonArg(args[0], "booking"));
  }

  const { options, repeated } = parseFlexibleFlagArgs(args, new Set(["json"]), new Set(["assigned-contact-id"]));
  return bookingInputSchema.parse({
    customerContactId: options["customer-contact-id"],
    projectId: options["project-id"],
    dealId: options["deal-id"],
    taskId: options["task-id"],
    salesInvoiceId: options["sales-invoice-id"],
    title: options.title,
    serviceType: options["service-type"],
    status: options.status,
    scheduledStartAt: options.start,
    scheduledEndAt: options.end,
    timezone: options.timezone,
    location: parseBookingLocation(options),
    assignedContactIds: repeated["assigned-contact-id"] ?? [],
    notes: options.notes,
  });
}

function parseBookingListFilters(args: string[]) {
  const { options } = parseFlexibleFlagArgs(args, new Set(["json"]));
  return {
    from: options.from,
    to: options.to,
    status: options.status,
    customerContactId: options["customer-contact-id"],
    assignedContactId: options["assigned-contact-id"],
    projectId: options["project-id"],
    dealId: options["deal-id"],
  };
}

function parseBookingConflictCheckArg(args: string[]) {
  if (args[0]?.trim().startsWith("{")) {
    return bookingAssignmentConflictCheckSchema.parse(parseJsonArg(args[0], "booking conflict check"));
  }

  const { options, repeated } = parseFlexibleFlagArgs(args, new Set(["json"]), new Set(["assigned-contact-id"]));
  return bookingAssignmentConflictCheckSchema.parse({
    bookingId: options["booking-id"],
    serviceType: options["service-type"],
    scheduledStartAt: options.start,
    scheduledEndAt: options.end,
    timezone: options.timezone,
    assignedContactIds: repeated["assigned-contact-id"] ?? [],
  });
}

function parseBookingAvailabilityEntries(values: string[] | undefined) {
  const byDay = new Map<string, Array<{ start: string; end: string }>>();
  for (const value of values ?? []) {
    const [dayOfWeek, start, end] = value.split("|");
    if (!dayOfWeek || !start || !end) {
      throw new Error(`Invalid availability value: ${value}. Expected day|HH:MM|HH:MM`);
    }

    byDay.set(dayOfWeek, [...(byDay.get(dayOfWeek) ?? []), { start, end }]);
  }

  return Array.from(byDay.entries()).map(([dayOfWeek, windows]) => ({ dayOfWeek, windows }));
}

function parseBookingAssignmentProfileArg(args: string[]) {
  if (args[0]?.trim().startsWith("{")) {
    return bookingAssignmentProfileInputSchema.parse(parseJsonArg(args[0], "booking assignment profile"));
  }

  const { options, repeated, booleans } = parseFlexibleFlagArgs(
    args,
    new Set(["json", "not-bookable"]),
    new Set(["availability", "booking-type"]),
  );
  return bookingAssignmentProfileInputSchema.parse({
    isBookable: !booleans.has("not-bookable"),
    timezone: options.timezone,
    weeklyAvailability: parseBookingAvailabilityEntries(repeated.availability),
    bufferBeforeMinutes: parseNumberOption(options["buffer-before-minutes"]),
    bufferAfterMinutes: parseNumberOption(options["buffer-after-minutes"]),
    maxBookingsPerDay: parseNumberOption(options["max-bookings-per-day"]),
    bookingTypes: repeated["booking-type"],
    effectiveFrom: options["effective-from"],
    effectiveTo: options["effective-to"],
    notes: options.notes,
  });
}

function parseBookingAvailabilityExceptionArg(args: string[]) {
  if (args[0]?.trim().startsWith("{")) {
    return bookingAvailabilityExceptionInputSchema.parse(parseJsonArg(args[0], "booking availability exception"));
  }

  const { options } = parseFlexibleFlagArgs(args, new Set(["json"]));
  return bookingAvailabilityExceptionInputSchema.parse({
    contactId: options["contact-id"],
    kind: options.kind,
    startAt: options.start,
    endAt: options.end,
    reason: options.reason,
    notes: options.notes,
  });
}

export const commandDefinitions: CliCommandDefinition[] = [
  {
    scope: "bookings",
    help: {
      description: "Create, inspect, schedule, complete, and cancel customer bookings.",
      commands: [
        "create <json-or-flags>",
        "get <id-or-slug>",
        "list [--from <iso>] [--to <iso>] [--status <status>] [--customer-contact-id <id>] [--assigned-contact-id <id>] [--project-id <id>] [--deal-id <id>]",
        "update <id-or-slug> <json>",
        "complete <id-or-slug> [--completion-notes <text>] [--create-follow-up-task]",
        "cancel <id-or-slug> --reason <text>",
        "delete <id-or-slug>",
        "check-assignment-conflicts <json-or-flags>",
      ],
      examples: [
        "bookings create --customer-contact-id ct_000245 --title \"Warehouse automation discovery visit\" --service-type visit --status confirmed --start 2026-04-10T09:00:00+02:00 --end 2026-04-10T11:00:00+02:00 --timezone Europe/Madrid --assigned-contact-id ct_emp_000011 --location-kind on_site --location-label \"Acme Retail warehouse\"",
        'bookings create \'{"customerContactId":"ct_000245","title":"Remote onboarding workshop","serviceType":"workshop","status":"tentative","scheduledStartAt":"2026-04-11T14:00:00+02:00","scheduledEndAt":"2026-04-11T16:00:00+02:00","timezone":"Europe/Madrid","assignedContactIds":["ct_emp_000011"],"location":{"kind":"remote","label":"Zoom"}}\'',
        "bookings list --from 2026-04-10T00:00:00Z --to 2026-04-17T00:00:00Z",
        "bookings complete book_000091 --completion-notes \"Site survey completed\" --create-follow-up-task",
      ],
    },
    handler({ subcommand, rest, positionalArgs, context }) {
      if (subcommand === "create") {
        context.printJson(createBooking(parseBookingInputArg(rest)));
        return;
      }

      if (subcommand === "get") {
        context.printJson(getBooking(rest[0]));
        return;
      }

      if (subcommand === "list") {
        context.printJson(listBookings(parseBookingListFilters(rest)));
        return;
      }

      if (subcommand === "update") {
        const input = bookingPatchSchema.parse(parseJsonArg(rest[1], "booking patch"));
        context.printJson(updateBooking(rest[0], input));
        return;
      }

      if (subcommand === "complete") {
        const flagArgs = parseFlexibleFlagArgs(rest.slice(1), new Set(["create-follow-up-task", "json"]));
        const input = rest[1]?.trim().startsWith("{")
          ? bookingCompleteSchema.parse(parseJsonArg(rest[1], "booking completion"))
          : bookingCompleteSchema.parse({
              completionNotes: flagArgs.options["completion-notes"],
              createFollowUpTask: flagArgs.booleans.has("create-follow-up-task"),
              followUpTaskTitle: flagArgs.options["follow-up-task-title"],
            });
        context.printJson(completeBooking(rest[0], input));
        return;
      }

      if (subcommand === "cancel") {
        const input = rest[1]?.trim().startsWith("{")
          ? bookingCancelSchema.parse(parseJsonArg(rest[1], "booking cancellation"))
          : bookingCancelSchema.parse({ reason: parseFlexibleFlagArgs(rest.slice(1), new Set(["json"])).options.reason });
        context.printJson(cancelBooking(rest[0], input));
        return;
      }

      if (subcommand === "delete") {
        softDeleteBooking(rest[0]);
        context.printJson({ ok: true });
        return;
      }

      if (subcommand === "check-assignment-conflicts") {
        context.printJson({ conflicts: checkBookingAssignmentConflicts(parseBookingConflictCheckArg(rest)) });
        return;
      }

      throwUnknownCommand(positionalArgs);
    },
  },
  {
    scope: "booking-assignment-profiles",
    help: {
      description: "Configure employee availability for booking assignment.",
      commands: ["list", "get <contact-id>", "set <contact-id> <json-or-flags>", "delete <contact-id>"],
      examples: [
        "booking-assignment-profiles set ct_emp_000011 --timezone Europe/Madrid --availability monday|09:00|13:00 --booking-type visit",
      ],
    },
    handler({ subcommand, rest, positionalArgs, context }) {
      if (subcommand === "list") {
        context.printJson(listBookingAssignmentProfiles());
        return;
      }

      if (subcommand === "get") {
        context.printJson(getBookingAssignmentProfile(rest[0]));
        return;
      }

      if (subcommand === "set") {
        context.printJson(upsertBookingAssignmentProfile(rest[0], parseBookingAssignmentProfileArg(rest.slice(1))));
        return;
      }

      if (subcommand === "delete") {
        softDeleteBookingAssignmentProfile(rest[0]);
        context.printJson({ ok: true });
        return;
      }

      throwUnknownCommand(positionalArgs);
    },
  },
  {
    scope: "booking-availability-exceptions",
    help: {
      description: "Manage one-off employee booking availability exceptions.",
      commands: [
        "create <json-or-flags>",
        "list [--contact-id <id>] [--kind <kind>]",
        "get <id-or-slug>",
        "update <id-or-slug> <json>",
        "delete <id-or-slug>",
      ],
      examples: [
        "booking-availability-exceptions create --contact-id ct_emp_000011 --kind time_off --start 2026-04-10T00:00:00+02:00 --end 2026-04-10T23:59:59+02:00 --reason vacation",
      ],
    },
    handler({ subcommand, rest, positionalArgs, context }) {
      if (subcommand === "create") {
        context.printJson(createBookingAvailabilityException(parseBookingAvailabilityExceptionArg(rest)));
        return;
      }

      if (subcommand === "list") {
        const { options } = parseFlexibleFlagArgs(rest, new Set(["json"]));
        context.printJson(listBookingAvailabilityExceptions({ contactId: options["contact-id"], kind: options.kind }));
        return;
      }

      if (subcommand === "get") {
        context.printJson(getBookingAvailabilityException(rest[0]));
        return;
      }

      if (subcommand === "update") {
        const input = bookingAvailabilityExceptionPatchSchema.parse(parseJsonArg(rest[1], "booking availability exception patch"));
        context.printJson(updateBookingAvailabilityException(rest[0], input));
        return;
      }

      if (subcommand === "delete") {
        softDeleteBookingAvailabilityException(rest[0]);
        context.printJson({ ok: true });
        return;
      }

      throwUnknownCommand(positionalArgs);
    },
  },
];
