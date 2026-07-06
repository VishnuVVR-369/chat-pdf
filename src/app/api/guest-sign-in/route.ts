import { randomUUID } from "node:crypto";
import { clerkClient } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import {
  checkGuestSignInRateLimit,
  hashGuestClientIdentifier,
} from "@/lib/guest-rate-limit";

export const runtime = "nodejs";

function getClientIdentifier(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const cloudflareIp = request.headers.get("cf-connecting-ip");

  return (
    forwardedFor?.split(",")[0]?.trim() ??
    realIp?.trim() ??
    cloudflareIp?.trim() ??
    "unknown"
  );
}

function getGuestUserIdentification(guestId: string) {
  const domain = process.env.GUEST_SIGN_IN_EMAIL_DOMAIN?.trim();

  if (domain) {
    return { emailAddress: [`guest-${guestId}@${domain}`] };
  }

  return {
    username: `guest_${guestId.replaceAll("-", "").slice(0, 24)}`,
  };
}

function createRateLimitedResponse(
  rateLimit: Extract<
    Awaited<ReturnType<typeof checkGuestSignInRateLimit>>,
    { allowed: false }
  >,
) {
  return NextResponse.json(
    { message: rateLimit.message },
    { headers: rateLimit.headers, status: rateLimit.status },
  );
}

export async function POST(request: NextRequest) {
  const clientIdentifier = getClientIdentifier(request);
  const rateLimit = await checkGuestSignInRateLimit(clientIdentifier);

  if (!rateLimit.allowed) {
    return createRateLimitedResponse(rateLimit);
  }

  try {
    const client = await clerkClient();
    const guestId = randomUUID();
    const shortGuestId = guestId.slice(0, 8);
    const user = await client.users.createUser({
      ...getGuestUserIdentification(guestId),
      externalId: `guest_${guestId}`,
      firstName: "Guest",
      lastName: shortGuestId,
      legalAcceptedAt: new Date(),
      publicMetadata: {
        isGuest: true,
      },
      privateMetadata: {
        guestClientHash: hashGuestClientIdentifier(clientIdentifier),
        guestCreatedAt: new Date().toISOString(),
      },
      skipLegalChecks: true,
      skipPasswordChecks: true,
      skipPasswordRequirement: true,
    });
    const signInToken = await client.signInTokens.createSignInToken({
      expiresInSeconds: 60,
      userId: user.id,
    });

    return NextResponse.json(
      { ticket: signInToken.token },
      { headers: rateLimit.headers },
    );
  } catch (error) {
    console.error("Guest sign-in failed.", error);

    return NextResponse.json(
      {
        message:
          "Guest sign-in is temporarily unavailable. Please try again later.",
      },
      { headers: rateLimit.headers, status: 503 },
    );
  }
}
