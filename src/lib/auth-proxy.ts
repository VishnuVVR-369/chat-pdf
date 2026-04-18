import { getToken } from "@convex-dev/better-auth/utils";
import type { NextRequest } from "next/server";

const CONVEX_JWT_COOKIE_NAME = "better-auth.convex_jwt";
const SESSION_COOKIE_NAME = "better-auth.session_token";

const convexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;

export async function hasOptimisticAuthSession(request: NextRequest) {
  if (!convexSiteUrl) {
    return false;
  }

  const hasConvexJwt = request.cookies.has(CONVEX_JWT_COOKIE_NAME);
  const hasSessionToken = request.cookies.has(SESSION_COOKIE_NAME);

  if (!hasConvexJwt && !hasSessionToken) {
    return false;
  }

  try {
    const headers = new Headers(request.headers);
    const { token } = await getToken(convexSiteUrl, headers, {
      jwtCache: {
        enabled: true,
        expirationToleranceSeconds: 60,
        isAuthError: () => true,
      },
    });

    return Boolean(token);
  } catch {
    return false;
  }
}
