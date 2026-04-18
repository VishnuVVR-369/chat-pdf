import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { hasOptimisticAuthSession } from "@/lib/auth-proxy";

export async function proxy(request: NextRequest) {
  if (await hasOptimisticAuthSession(request)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/sign-in"],
};
