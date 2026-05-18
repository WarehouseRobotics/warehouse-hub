import { createHash } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

import { config } from "../config.js";

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type RateLimitSpec = {
  key: string;
  limit: number;
  windowMs: number;
};

type RateLimitExceeded = {
  limit: number;
  retryAfterSeconds: number;
  windowMs: number;
};

class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, RateLimitBucket>();
  private checksSinceCleanup = 0;

  consume(specs: RateLimitSpec[], now = Date.now()): RateLimitExceeded | null {
    this.cleanupExpiredBuckets(now);

    const buckets = specs.map((spec) => ({
      spec,
      bucket: this.getActiveBucket(spec, now),
    }));
    const exceeded = buckets.find(
      ({ bucket, spec }) => bucket.count >= spec.limit,
    );

    if (exceeded) {
      return {
        limit: exceeded.spec.limit,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((exceeded.bucket.resetAt - now) / 1000),
        ),
        windowMs: exceeded.spec.windowMs,
      };
    }

    for (const { bucket } of buckets) {
      bucket.count += 1;
    }

    return null;
  }

  private getActiveBucket(spec: RateLimitSpec, now: number): RateLimitBucket {
    const existing = this.buckets.get(spec.key);
    if (existing && existing.resetAt > now) {
      return existing;
    }

    const bucket = {
      count: 0,
      resetAt: now + spec.windowMs,
    };
    this.buckets.set(spec.key, bucket);
    return bucket;
  }

  private cleanupExpiredBuckets(now: number): void {
    this.checksSinceCleanup += 1;
    if (this.checksSinceCleanup < 256) {
      return;
    }

    this.checksSinceCleanup = 0;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
      }
    }
  }
}

const authRateLimiter = new FixedWindowRateLimiter();

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function getClientIp(request: Request): string {
  return request.ip || request.socket.remoteAddress || "unknown";
}

function sendRateLimitedResponse(
  response: Response,
  exceeded: RateLimitExceeded,
): void {
  response.setHeader("Retry-After", String(exceeded.retryAfterSeconds));
  response.status(429).json({
    error: {
      code: "rate_limit_exceeded",
      message: "Too many authentication attempts",
      retryAfterSeconds: exceeded.retryAfterSeconds,
      limit: exceeded.limit,
      windowMs: exceeded.windowMs,
      details: {
        retryAfterSeconds: exceeded.retryAfterSeconds,
        limit: exceeded.limit,
        windowMs: exceeded.windowMs,
      },
    },
  });
}

function authWindowMs(): number {
  return config.AUTH_RATE_LIMIT_WINDOW_MS;
}

export function rateLimitLogin(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  if (!config.AUTH_RATE_LIMIT_ENABLED) {
    next();
    return;
  }

  const windowMs = authWindowMs();
  const email = normalizeEmail(String(request.body.email));
  const exceeded = authRateLimiter.consume([
    {
      key: `auth:login:ip:${getClientIp(request)}`,
      limit: config.AUTH_LOGIN_IP_LIMIT,
      windowMs,
    },
    {
      key: `auth:login:email:${email}`,
      limit: config.AUTH_LOGIN_EMAIL_LIMIT,
      windowMs,
    },
  ]);

  if (exceeded) {
    sendRateLimitedResponse(response, exceeded);
    return;
  }

  next();
}

export function rateLimitMagicLinkRequest(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  if (!config.AUTH_RATE_LIMIT_ENABLED) {
    next();
    return;
  }

  const windowMs = authWindowMs();
  const email = normalizeEmail(String(request.body.email));
  const exceeded = authRateLimiter.consume([
    {
      key: `auth:magic-link-request:ip:${getClientIp(request)}`,
      limit: config.AUTH_MAGIC_LINK_REQUEST_IP_LIMIT,
      windowMs,
    },
    {
      key: `auth:magic-link-request:email:${email}`,
      limit: config.AUTH_MAGIC_LINK_REQUEST_EMAIL_LIMIT,
      windowMs,
    },
  ]);

  if (exceeded) {
    sendRateLimitedResponse(response, exceeded);
    return;
  }

  next();
}

export function rateLimitMagicLinkConsume(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  if (!config.AUTH_RATE_LIMIT_ENABLED) {
    next();
    return;
  }

  const windowMs = authWindowMs();
  const tokenHash = hashIdentifier(String(request.body.token));
  const exceeded = authRateLimiter.consume([
    {
      key: `auth:magic-link-consume:ip:${getClientIp(request)}`,
      limit: config.AUTH_MAGIC_LINK_CONSUME_IP_LIMIT,
      windowMs,
    },
    {
      key: `auth:magic-link-consume:token:${tokenHash}`,
      limit: config.AUTH_MAGIC_LINK_CONSUME_TOKEN_LIMIT,
      windowMs,
    },
  ]);

  if (exceeded) {
    sendRateLimitedResponse(response, exceeded);
    return;
  }

  next();
}
