import { captureEvent, initAnalytics } from "@/lib/analytics";

try {
  initAnalytics();
} catch {
  // Analytics must never block app startup.
}

export function onRouterTransitionStart(
  url: string,
  navigationType: "push" | "replace" | "traverse",
) {
  captureEvent("route_navigation_started", {
    navigation_type: navigationType,
    url,
  });
}
