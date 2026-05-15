import type { Response } from "express";

import { config } from "../config.js";
import {
  createSession,
  type CreatedUserSession,
} from "../services/user-sessions.js";
import type { User } from "../services/users.js";
import type { Workspace } from "../services/workspaces.js";

export type PublicUser = {
  id: string;
  email: string;
  displayName: string;
  role: User["role"];
};

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: config.NODE_ENV === "production",
    path: "/",
  };
}

export function mapPublicUser(user: User): PublicUser {
  return {
    id: user.userId,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
  };
}

export function mapPublicWorkspace(workspace: Workspace) {
  return {
    id: workspace.id,
    slug: workspace.slug,
    name: workspace.name,
  };
}

export function sendCreatedSessionResponse(
  response: Response,
  user: User,
  session: CreatedUserSession,
): void {
  response.cookie("wh_session", session.sessionToken, {
    ...sessionCookieOptions(),
    expires: new Date(session.expiresAt),
  });
  response.json({
    userId: user.userId,
    sessionToken: session.sessionToken,
    expiresAt: session.expiresAt,
    user: mapPublicUser(user),
  });
}

export function sendSessionResponse(
  response: Response,
  user: User,
  options: { userAgent?: string | null } = {},
): void {
  const session = createSession(user.userId, {
    userAgent: options.userAgent ?? null,
  });

  sendCreatedSessionResponse(response, user, session);
}

export function clearSessionCookie(response: Response): void {
  response.clearCookie("wh_session", sessionCookieOptions());
}
