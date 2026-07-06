import "server-only";

import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";

const DEFAULT_WINDOW_SECONDS = 60 * 60;
const DEFAULT_IP_LIMIT = 5;
const DEFAULT_GLOBAL_LIMIT = 100;

type LimitConfig = {
  limit: number;
  windowSeconds: number;
};

type LimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

type RateLimitResult =
  | { allowed: true; headers: Headers }
  | { allowed: false; headers: Headers; message: string; status: 429 };

const memoryWindows = new Map<string, { count: number; resetAt: number }>();
let redis: Redis | null | undefined;

function readPositiveInt(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getLimitConfig(prefix: "GUEST_SIGN_IN" | "GUEST_SIGN_IN_GLOBAL") {
  return {
    limit: readPositiveInt(
      `${prefix}_RATE_LIMIT_MAX`,
      prefix === "GUEST_SIGN_IN" ? DEFAULT_IP_LIMIT : DEFAULT_GLOBAL_LIMIT,
    ),
    windowSeconds: readPositiveInt(
      `${prefix}_RATE_LIMIT_WINDOW_SECONDS`,
      DEFAULT_WINDOW_SECONDS,
    ),
  } satisfies LimitConfig;
}

function getRedis() {
  if (redis !== undefined) return redis;

  redis =
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
      ? Redis.fromEnv()
      : null;
  return redis;
}

function getWindowBucket(windowSeconds: number) {
  return Math.floor(Date.now() / (windowSeconds * 1000));
}

function getResetAt(windowSeconds: number) {
  return (getWindowBucket(windowSeconds) + 1) * windowSeconds * 1000;
}

function hashIdentifier(identifier: string) {
  return createHash("sha256").update(identifier).digest("hex").slice(0, 32);
}

async function checkRedisLimit(
  key: string,
  config: LimitConfig,
): Promise<number | null> {
  const redisClient = getRedis();
  if (!redisClient) return null;

  const count = await redisClient.incr(key);
  if (count === 1) {
    await redisClient.expire(key, config.windowSeconds);
  }
  return count;
}

function checkMemoryLimit(key: string, resetAt: number) {
  const current = memoryWindows.get(key);

  if (!current || current.resetAt <= Date.now()) {
    memoryWindows.set(key, { count: 1, resetAt });
    return 1;
  }

  current.count += 1;
  return current.count;
}

async function checkFixedWindowLimit(
  keyPrefix: string,
  identifier: string,
  config: LimitConfig,
): Promise<LimitResult> {
  const key = [
    "chatpdf",
    "guest-sign-in",
    keyPrefix,
    hashIdentifier(identifier),
    getWindowBucket(config.windowSeconds),
  ].join(":");
  const resetAt = getResetAt(config.windowSeconds);
  const count =
    (await checkRedisLimit(key, config)) ?? checkMemoryLimit(key, resetAt);

  return {
    allowed: count <= config.limit,
    limit: config.limit,
    remaining: Math.max(config.limit - count, 0),
    resetAt,
    retryAfterSeconds: Math.max(Math.ceil((resetAt - Date.now()) / 1000), 1),
  };
}

function createHeaders(ipLimit: LimitResult, globalLimit: LimitResult) {
  const headers = new Headers();
  const retryAfterSeconds = Math.max(
    ipLimit.retryAfterSeconds,
    globalLimit.retryAfterSeconds,
  );

  headers.set("RateLimit-Limit", String(ipLimit.limit));
  headers.set("RateLimit-Remaining", String(ipLimit.remaining));
  headers.set("RateLimit-Reset", String(Math.ceil(ipLimit.resetAt / 1000)));

  if (!ipLimit.allowed || !globalLimit.allowed) {
    headers.set("Retry-After", String(retryAfterSeconds));
  }

  return headers;
}

export async function checkGuestSignInRateLimit(
  clientIdentifier: string,
): Promise<RateLimitResult> {
  const ipConfig = getLimitConfig("GUEST_SIGN_IN");
  const globalConfig = getLimitConfig("GUEST_SIGN_IN_GLOBAL");

  const [ipLimit, globalLimit] = await Promise.all([
    checkFixedWindowLimit("ip", clientIdentifier, ipConfig),
    checkFixedWindowLimit("global", "all", globalConfig),
  ]);
  const headers = createHeaders(ipLimit, globalLimit);

  if (!ipLimit.allowed) {
    return {
      allowed: false,
      headers,
      message:
        "Guest sign-in is temporarily rate limited from this network. Please try again later.",
      status: 429,
    };
  }

  if (!globalLimit.allowed) {
    return {
      allowed: false,
      headers,
      message:
        "Guest sign-in is temporarily busy. Please try again in a little while.",
      status: 429,
    };
  }

  return { allowed: true, headers };
}

export function hashGuestClientIdentifier(identifier: string) {
  return hashIdentifier(identifier);
}
