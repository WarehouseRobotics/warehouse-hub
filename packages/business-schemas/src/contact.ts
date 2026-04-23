import { z } from "zod";

import { addressSchema } from "./company-card.js";

export const contactRolesSchema = z.array(z.enum(["customer", "supplier", "employee", "both", "owned", "contact"])).min(1);

export const contactNotificationChannelRoomsSchema = z
  .object({
    slack: z.array(z.string().min(1)).optional(),
    discord: z.array(z.string().min(1)).optional(),
    telegram: z.array(z.string().min(1)).optional(),
    whatsapp: z.array(z.string().min(1)).optional(),
  })
  .strict();

export const contactNotificationPreferencesSchema = z
  .object({
    preferredNotificationSchedule: z.string().min(1).optional(),
    doNotDisturb: z.boolean().optional(),
    channelRooms: contactNotificationChannelRoomsSchema.optional(),
  })
  .strict();

export const contactInputSchema = z
  .object({
    parentContactId: z.string().optional(),
    type: z.enum(["person", "company"]),
    roles: contactRolesSchema,
    displayName: z.string().min(1),
    legalName: z.string().optional(),
    taxId: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    billingAddress: addressSchema.optional(),
    notes: z.string().optional(),
    slackUserId: z.string().min(1).optional(),
    discordUserId: z.string().min(1).optional(),
    whatsappUserId: z.string().min(1).optional(),
    telegramUserId: z.string().min(1).optional(),
    notificationPreferences: contactNotificationPreferencesSchema.nullable().optional(),
    status: z.enum(["active", "inactive"]).default("active"),
  })
  .strict();

export const contactPatchSchema = z
  .object({
    parentContactId: z.union([z.string().min(1), z.null()]).optional(),
    type: z.enum(["person", "company"]).optional(),
    roles: contactRolesSchema.optional(),
    displayName: z.string().min(1).optional(),
    legalName: z.union([z.string().min(1), z.null()]).optional(),
    taxId: z.union([z.string().min(1), z.null()]).optional(),
    email: z.union([z.string().email(), z.null()]).optional(),
    phone: z.union([z.string().min(1), z.null()]).optional(),
    billingAddress: z.union([addressSchema, z.null()]).optional(),
    notes: z.union([z.string(), z.null()]).optional(),
    slackUserId: z.union([z.string().min(1), z.null()]).optional(),
    discordUserId: z.union([z.string().min(1), z.null()]).optional(),
    whatsappUserId: z.union([z.string().min(1), z.null()]).optional(),
    telegramUserId: z.union([z.string().min(1), z.null()]).optional(),
    notificationPreferences: z.union([contactNotificationPreferencesSchema, z.null()]).optional(),
    status: z.enum(["active", "inactive"]).optional(),
  })
  .strict();

export const contactResolveInputSchema = z
  .object({
    autoCreate: z.boolean().default(false),
    matchBy: z.array(z.enum(["taxId", "email", "legalName", "canonicalName"])).min(1),
    contact: contactInputSchema,
  })
  .strict();

export type ContactInput = z.infer<typeof contactInputSchema>;
export type ContactNotificationChannelRooms = z.infer<typeof contactNotificationChannelRoomsSchema>;
export type ContactNotificationPreferences = z.infer<typeof contactNotificationPreferencesSchema>;
export type ContactPatch = z.infer<typeof contactPatchSchema>;
export type ContactType = ContactInput["type"];
export type ContactResolveInput = z.infer<typeof contactResolveInputSchema>;
