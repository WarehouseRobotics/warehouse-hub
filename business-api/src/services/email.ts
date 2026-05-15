import { Resend } from "resend";

import { config } from "../config.js";
import { logger } from "../lib/logger.js";

const EMAIL_FROM = "Warehouse Hub <onboarding@wrobo.io>";

type MagicLinkLoginEmailInput = {
  to: string;
  token: string;
  expiresAt: string;
};

type UserInviteEmailInput = {
  to: string;
  inviterName: string;
  workspaceName: string;
  token: string;
  expiresAt: string;
};

type ResendEmailInput = {
  to: string;
  subject: string;
  html: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildMagicLinkLoginUrl(token: string): string {
  const url = new URL("/auth/consume", config.DASHBOARD_BASE_URL);
  url.searchParams.set("token", token);
  return url.toString();
}

export function buildUserInviteUrl(token: string): string {
  return new URL(
    `/accept-invite/${token}`,
    config.DASHBOARD_BASE_URL,
  ).toString();
}

async function sendEmail(input: ResendEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY ?? config.RESEND_API_KEY;
  if (!apiKey) {
    logger.warn("Email delivery skipped because RESEND_API_KEY is unset", {
      to: input.to,
      subject: input.subject,
      html: input.html,
    });
    return;
  }

  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from: EMAIL_FROM,
    to: input.to,
    subject: input.subject,
    html: input.html,
  });

  if (result.error) {
    throw new Error(`Resend email delivery failed: ${result.error.message}`);
  }
}

export async function magicLinkLoginEmail(
  input: MagicLinkLoginEmailInput,
): Promise<void> {
  const url = escapeHtml(buildMagicLinkLoginUrl(input.token));
  const expiresAt = escapeHtml(input.expiresAt);
  await sendEmail({
    to: input.to,
    subject: "Your Warehouse Hub sign-in link",
    html: [
      "<p>Use this link to sign in to Warehouse Hub.</p>",
      `<p><a href="${url}">Sign in</a></p>`,
      `<p>This link expires at ${expiresAt}.</p>`,
    ].join(""),
  });
}

export async function userInviteEmail(
  input: UserInviteEmailInput,
): Promise<void> {
  const url = escapeHtml(buildUserInviteUrl(input.token));
  const inviterName = escapeHtml(input.inviterName);
  const workspaceName = escapeHtml(input.workspaceName);
  const expiresAt = escapeHtml(input.expiresAt);
  await sendEmail({
    to: input.to,
    subject: `Invitation to ${input.workspaceName}`,
    html: [
      `<p>${inviterName} invited you to ${workspaceName}.</p>`,
      `<p><a href="${url}">Accept invitation</a></p>`,
      `<p>This invitation expires at ${expiresAt}.</p>`,
    ].join(""),
  });
}
