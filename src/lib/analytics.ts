import posthog from "posthog-js";
import type { Properties } from "posthog-js";

const POSTHOG_TOKEN =
  process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN ??
  process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

let initialized = false;

function isBrowser() {
  return typeof window !== "undefined";
}

export function initAnalytics() {
  if (!isBrowser() || initialized || !POSTHOG_TOKEN) return;

  posthog.init(POSTHOG_TOKEN, {
    api_host: POSTHOG_HOST,
    autocapture: false,
    capture_pageview: "history_change",
    defaults: "2026-01-30",
    disable_session_recording: true,
    person_profiles: "identified_only",
  });

  initialized = true;
}

function getPostHog() {
  if (!initialized) {
    initAnalytics();
  }

  return initialized ? posthog : null;
}

export function captureEvent(event: string, properties?: Properties) {
  getPostHog()?.capture(event, {
    app: "chat-pdf",
    ...properties,
  });
}

export function identifyUser(
  userId: string,
  properties?: {
    email?: string | null;
    name?: string | null;
  },
) {
  getPostHog()?.identify(userId, {
    email: properties?.email ?? undefined,
    name: properties?.name ?? undefined,
  });
}

export function resetAnalytics() {
  getPostHog()?.reset();
}

export function captureException(error: unknown, properties?: Properties) {
  const message = error instanceof Error ? error.message : String(error);

  captureEvent("client_exception", {
    message,
    ...properties,
  });
}
