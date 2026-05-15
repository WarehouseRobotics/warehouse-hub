import { and, asc, eq, isNull } from "drizzle-orm";

import { getDatabase, getOrm } from "../db/connection.js";
import {
  magicLinkTokens,
  userInvitations,
  type UserInvitationRole,
} from "../db/schema/index.js";
import { AppError } from "../lib/errors.js";
import { createPrefixedId } from "../lib/ids.js";
import { hashPassword } from "../lib/passwords.js";
import { createMagicLink, consumeMagicLink } from "./magic-link-tokens.js";
import { getUserRecordByIdOrEmail, requireUserRecord } from "./shared.js";
import { createSession, type CreatedUserSession } from "./user-sessions.js";
import { createUserWithPasswordHash, type User } from "./users.js";
import { buildUserInviteUrl, userInviteEmail } from "./email.js";
import { getWorkspace } from "./workspaces.js";

const validInvitationRoles = new Set<UserInvitationRole>(["admin", "member"]);

export type UserInvitation = {
  invitationId: string;
  email: string;
  invitedByUserId: string;
  role: UserInvitationRole;
  magicLinkTokenId: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export type CreatedUserInvitation = UserInvitation & {
  acceptUrl: string;
};

export type AcceptedUserInvitation = {
  invitation: UserInvitation;
  user: User;
  session: CreatedUserSession;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function validateInvitationRole(role: UserInvitationRole): void {
  if (!validInvitationRoles.has(role)) {
    throw new AppError("User invitation role is invalid", {
      statusCode: 400,
      code: "validation_error",
    });
  }
}

function throwInvalidInvitation(): never {
  throw new AppError("User invitation is invalid or expired", {
    statusCode: 401,
    code: "invalid_user_invitation",
  });
}

function throwUserAlreadyExists(email: string): never {
  throw new AppError(`User already exists: ${email}`, {
    statusCode: 409,
    code: "conflict",
  });
}

function requireMagicLinkRecord(magicLinkTokenId: string) {
  const record = getOrm()
    .select()
    .from(magicLinkTokens)
    .where(eq(magicLinkTokens.id, magicLinkTokenId))
    .get();

  if (!record) {
    throwInvalidInvitation();
  }

  return record;
}

function mapUserInvitation(
  record: typeof userInvitations.$inferSelect,
  expiresAt = requireMagicLinkRecord(record.magicLinkTokenId).expiresAt,
): UserInvitation {
  return {
    invitationId: record.id,
    email: record.email,
    invitedByUserId: record.invitedByUserId,
    role: record.role,
    magicLinkTokenId: record.magicLinkTokenId,
    expiresAt,
    acceptedAt: record.acceptedAt,
    revokedAt: record.revokedAt,
    createdAt: record.createdAt,
  };
}

function getInvitationByMagicLinkTokenId(magicLinkTokenId: string) {
  return getOrm()
    .select()
    .from(userInvitations)
    .where(eq(userInvitations.magicLinkTokenId, magicLinkTokenId))
    .get();
}

function getInvitationById(invitationId: string) {
  return getOrm()
    .select()
    .from(userInvitations)
    .where(eq(userInvitations.id, invitationId))
    .get();
}

export async function createInvitation(input: {
  email: string;
  invitedByUserId: string;
  role: UserInvitationRole;
}): Promise<CreatedUserInvitation> {
  validateInvitationRole(input.role);
  const invitedBy = requireUserRecord(input.invitedByUserId);
  const email = normalizeEmail(input.email);
  if (getUserRecordByIdOrEmail(email)) {
    throw new AppError(`User already exists: ${email}`, {
      statusCode: 409,
      code: "conflict",
    });
  }

  const magicLink = createMagicLink({
    email,
    purpose: "invite_accept",
  });
  const createdAt = new Date().toISOString();
  const record = {
    id: createPrefixedId("inv_"),
    email,
    invitedByUserId: invitedBy.id,
    role: input.role,
    magicLinkTokenId: magicLink.magicLinkTokenId,
    acceptedAt: null,
    revokedAt: null,
    createdAt,
  };

  getOrm().insert(userInvitations).values(record).run();

  await userInviteEmail({
    to: email,
    inviterName: invitedBy.displayName,
    workspaceName: getWorkspace().name,
    token: magicLink.token,
    expiresAt: magicLink.expiresAt,
  });

  return {
    ...mapUserInvitation(record, magicLink.expiresAt),
    acceptUrl: buildUserInviteUrl(magicLink.token),
  };
}

export async function acceptInvitation(
  token: string,
  input: {
    displayName: string;
    password?: string | null;
    userAgent?: string | null;
  },
): Promise<AcceptedUserInvitation> {
  const passwordHash =
    input.password === undefined || input.password === null
      ? null
      : await hashPassword(input.password);

  const acceptTransaction = getDatabase().transaction(() => {
    const magicLink = consumeMagicLink(token, "invite_accept");
    const invitation = getInvitationByMagicLinkTokenId(
      magicLink.magicLinkTokenId,
    );
    if (!invitation || invitation.revokedAt || invitation.acceptedAt) {
      throwInvalidInvitation();
    }
    if (getUserRecordByIdOrEmail(invitation.email)) {
      throwUserAlreadyExists(invitation.email);
    }

    const user = createUserWithPasswordHash({
      email: invitation.email,
      displayName: input.displayName,
      passwordHash,
      role: invitation.role,
    });
    const acceptedAt = new Date().toISOString();
    getOrm()
      .update(userInvitations)
      .set({ acceptedAt })
      .where(eq(userInvitations.id, invitation.id))
      .run();

    return {
      invitation: mapUserInvitation({
        ...invitation,
        acceptedAt,
      }),
      user,
      session: createSession(user.userId, {
        userAgent: input.userAgent ?? null,
      }),
    };
  });

  return acceptTransaction();
}

export function revokeInvitation(invitationId: string): UserInvitation {
  const existing = getInvitationById(invitationId);
  if (!existing) {
    throw new AppError(`User invitation not found: ${invitationId}`, {
      statusCode: 404,
      code: "not_found",
    });
  }

  const revokedAt = new Date().toISOString();
  getOrm()
    .update(userInvitations)
    .set({ revokedAt })
    .where(eq(userInvitations.id, existing.id))
    .run();

  return mapUserInvitation({
    ...existing,
    revokedAt,
  });
}

export function listPendingInvitations(): UserInvitation[] {
  return getOrm()
    .select()
    .from(userInvitations)
    .where(
      and(
        isNull(userInvitations.acceptedAt),
        isNull(userInvitations.revokedAt),
      ),
    )
    .orderBy(asc(userInvitations.createdAt), asc(userInvitations.id))
    .all()
    .map((record) => mapUserInvitation(record));
}
