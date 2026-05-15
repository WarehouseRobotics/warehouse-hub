import { Router } from "express";
import { z } from "zod";

import { asyncRoute } from "../lib/express.js";
import { requireCurrentUserId, requireRole } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import {
  acceptInvitation,
  createInvitation,
  revokeInvitation,
} from "../services/user-invitations.js";
import { listUsers, softDeleteUser, updateUser } from "../services/users.js";
import { sendCreatedSessionResponse } from "./session-response.js";

export const publicUsersRouter = Router();
export const usersRouter = Router();

const invitationRoleSchema = z.enum(["admin", "member"]);
const userRoleSchema = z.enum(["owner", "admin", "member"]);

const createInvitationSchema = z.object({
  email: z.string().email(),
  role: invitationRoleSchema,
});

const acceptInvitationSchema = z.object({
  displayName: z.string().trim().min(1),
  password: z.string().min(8).nullable().optional(),
});

const updateUserSchema = z
  .object({
    displayName: z.string().trim().min(1).optional(),
    role: userRoleSchema.optional(),
  })
  .refine((patch) => patch.displayName !== undefined || patch.role !== undefined, {
    message: "At least one field must be provided",
  });

publicUsersRouter.post(
  "/invitations/:token/accept",
  validateBody(acceptInvitationSchema),
  asyncRoute(async (request, response) => {
    const accepted = await acceptInvitation(
      request.params.token,
      {
        displayName: request.body.displayName,
        password: request.body.password,
        userAgent: request.header("user-agent") ?? null,
      },
    );

    sendCreatedSessionResponse(response, accepted.user, accepted.session);
  }),
);

usersRouter.use(requireRole("admin"));

usersRouter.get("/", (_request, response) => {
  response.json(listUsers());
});

usersRouter.post(
  "/invitations",
  validateBody(createInvitationSchema),
  asyncRoute(async (request, response) => {
    const invitation = await createInvitation({
      email: request.body.email,
      invitedByUserId: requireCurrentUserId(request),
      role: request.body.role,
    });

    response.locals.audit = {
      action: "user.invitation.create",
      objectType: "user_invitation",
      objectId: invitation.invitationId,
      metadata: {
        email: invitation.email,
        role: invitation.role,
      },
    };
    response.status(201).json(invitation);
  }),
);

usersRouter.delete("/invitations/:id", (request, response, next) => {
  try {
    const invitation = revokeInvitation(request.params.id);
    response.locals.audit = {
      action: "user.invitation.revoke",
      objectType: "user_invitation",
      objectId: invitation.invitationId,
      metadata: {
        email: invitation.email,
        role: invitation.role,
      },
    };
    response.json(invitation);
  } catch (error) {
    next(error);
  }
});

usersRouter.patch(
  "/:id",
  validateBody(updateUserSchema),
  asyncRoute(async (request, response) => {
    const user = await updateUser(
      request.params.id,
      request.body,
    );
    response.locals.audit = {
      action: "user.update",
      objectType: "user",
      objectId: user.userId,
      metadata: {
        role: user.role,
      },
    };
    response.json(user);
  }),
);

usersRouter.delete("/:id", (request, response, next) => {
  try {
    const userId = request.params.id;
    softDeleteUser(userId);
    response.locals.audit = {
      action: "user.delete",
      objectType: "user",
      objectId: userId,
    };
    response.status(204).send();
  } catch (error) {
    next(error);
  }
});
