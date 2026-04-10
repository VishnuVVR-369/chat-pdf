"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

type AuthMode = "sign-in" | "sign-up";
type Provider = "google" | "github";

const copy = {
  "sign-in": {
    badge: "Welcome back",
    title: "Sign in and pick up where you left off.",
    description:
      "Continue with Google or GitHub and head straight into your workspace.",
    primaryLabel: "Sign in with",
    alternateLabel: "Need an account?",
    alternateHref: "/sign-up",
    alternateCta: "Create one",
  },
  "sign-up": {
    badge: "Create your account",
    title: "Start your document workflow in one click.",
    description:
      "Use Google or GitHub to create your account and land directly in the dashboard.",
    primaryLabel: "Continue with",
    alternateLabel: "Already have an account?",
    alternateHref: "/sign-in",
    alternateCta: "Sign in",
  },
} as const;

export function AuthCard({ mode }: { mode: AuthMode }) {
  const [pendingProvider, setPendingProvider] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);

  const content = copy[mode];

  const handleSocialAuth = async (provider: Provider) => {
    setPendingProvider(provider);
    setError(null);

    try {
      const result = await authClient.signIn.social({
        provider,
        callbackURL: "/dashboard",
        newUserCallbackURL: "/dashboard",
        requestSignUp: mode === "sign-up",
      });

      if (result.error) {
        setError(result.error.message ?? "Authentication failed.");
        setPendingProvider(null);
      }
    } catch (authError) {
      setError(
        authError instanceof Error
          ? authError.message
          : "Authentication failed.",
      );
      setPendingProvider(null);
    }
  };

  return (
    <div className="relative w-full max-w-md overflow-hidden rounded-[2rem] border border-white/70 bg-white/90 p-8 shadow-[0_24px_90px_-32px_rgba(17,24,39,0.45)] backdrop-blur">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-400 via-cyan-500 to-blue-600" />
      <div className="space-y-6">
        <div className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
            {content.badge}
          </p>
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
              {content.title}
            </h1>
            <p className="text-sm leading-6 text-slate-600">
              {content.description}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <SocialButton
            disabled={pendingProvider !== null}
            label={`${content.primaryLabel} Google`}
            onClick={() => handleSocialAuth("google")}
            provider="google"
            pending={pendingProvider === "google"}
          />
          <SocialButton
            disabled={pendingProvider !== null}
            label={`${content.primaryLabel} GitHub`}
            onClick={() => handleSocialAuth("github")}
            provider="github"
            pending={pendingProvider === "github"}
          />
        </div>

        {error ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        <div className="flex items-center gap-2 text-sm text-slate-600">
          <span>{content.alternateLabel}</span>
          <Link
            className="font-semibold text-slate-950 underline decoration-slate-300 underline-offset-4 transition hover:decoration-slate-950"
            href={content.alternateHref}
          >
            {content.alternateCta}
          </Link>
        </div>
      </div>
    </div>
  );
}

function SocialButton({
  disabled,
  label,
  onClick,
  pending,
  provider,
}: {
  disabled: boolean;
  label: string;
  onClick: () => void;
  pending: boolean;
  provider: Provider;
}) {
  return (
    <Button
      className="h-13 w-full justify-start rounded-[1.4rem] border-slate-200 bg-white px-4 text-base text-slate-900 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
      disabled={disabled}
      onClick={onClick}
      size="lg"
      type="button"
      variant="outline"
    >
      {provider === "google" ? <GoogleMark /> : <GitHubMark />}
      <span>{pending ? `${label}...` : label}</span>
    </Button>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24">
      <path
        d="M21.81 12.23c0-.72-.06-1.24-.19-1.79H12v3.37h5.65a4.84 4.84 0 0 1-2.1 3.18v2.79h3.6c2.1-1.94 3.31-4.8 3.31-8.55Z"
        fill="#4285F4"
      />
      <path
        d="M12 22c2.76 0 5.08-.91 6.77-2.47l-3.6-2.79c-1 .67-2.28 1.07-3.17 1.07-2.44 0-4.5-1.65-5.23-3.87H3.06v2.88A10 10 0 0 0 12 22Z"
        fill="#34A853"
      />
      <path
        d="M6.77 13.94A6.1 6.1 0 0 1 6.48 12c0-.68.11-1.34.29-1.94V7.18H3.06a10 10 0 0 0 0 9.64l3.71-2.88Z"
        fill="#FBBC05"
      />
      <path
        d="M12 6.19c1.42 0 2.69.49 3.69 1.44l2.77-2.77C17.07 3.56 14.75 2.5 12 2.5a10 10 0 0 0-8.94 4.68l3.71 2.88C7.5 7.84 9.56 6.19 12 6.19Z"
        fill="#EA4335"
      />
    </svg>
  );
}

function GitHubMark() {
  return (
    <svg
      aria-hidden="true"
      className="size-5 fill-current"
      viewBox="0 0 24 24"
    >
      <path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.41-4.04-1.41-.55-1.4-1.34-1.77-1.34-1.77-1.1-.75.09-.73.09-.73 1.21.09 1.85 1.26 1.85 1.26 1.08 1.85 2.83 1.32 3.52 1 .11-.79.42-1.33.76-1.64-2.67-.3-5.48-1.34-5.48-5.97 0-1.32.47-2.39 1.25-3.24-.13-.3-.54-1.53.12-3.18 0 0 1.02-.33 3.35 1.24a11.64 11.64 0 0 1 6.1 0c2.32-1.57 3.34-1.24 3.34-1.24.67 1.65.26 2.88.13 3.18.78.85 1.24 1.92 1.24 3.24 0 4.64-2.81 5.66-5.49 5.96.43.37.82 1.11.82 2.24v3.32c0 .32.21.69.83.57A12 12 0 0 0 12 .5Z" />
    </svg>
  );
}
