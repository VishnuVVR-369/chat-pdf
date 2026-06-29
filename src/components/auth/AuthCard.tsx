"use client";

import { useSignIn } from "@clerk/nextjs";
import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Provider = "google" | "github";

const PROVIDER_STRATEGY: Record<Provider, "oauth_google" | "oauth_github"> = {
  google: "oauth_google",
  github: "oauth_github",
};

export function AuthCard() {
  const { fetchStatus, signIn } = useSignIn();
  const [pendingProvider, setPendingProvider] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shouldReduceMotion = useReducedMotion();
  const authIsReady = Boolean(signIn) && fetchStatus === "idle";

  const handleSocialAuth = async (provider: Provider) => {
    if (!signIn) {
      setError("Authentication is still loading. Please try again.");
      return;
    }

    setPendingProvider(provider);
    setError(null);

    try {
      const result = await signIn.sso({
        strategy: PROVIDER_STRATEGY[provider],
        redirectUrl: "/dashboard",
        redirectCallbackUrl: "/sso-callback",
      });

      if (result.error) {
        setError(getAuthErrorMessage(result.error));
        setPendingProvider(null);
      }
    } catch (authError) {
      setError(getAuthErrorMessage(authError));
      setPendingProvider(null);
    }
  };

  return (
    <motion.div
      className="relative w-full max-w-sm overflow-hidden rounded-[2rem] border border-stone-800/80 bg-[#0c0c0c]/95 p-8 shadow-[0_35px_100px_-24px_rgba(0,0,0,0.75)] backdrop-blur-md"
      initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }}
      animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: "easeOut" }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.08),transparent_38%)]" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/60 to-transparent" />

      <div className="relative flex flex-col items-center text-center">
        <BrandLogo priority />
        <h1 className="mt-6 text-2xl font-bold tracking-tight text-stone-100">
          Welcome back
        </h1>

        <div className="mt-8 w-full space-y-3">
          <SocialButton
            disabled={!authIsReady || pendingProvider !== null}
            label="Continue with Google"
            onClick={() => handleSocialAuth("google")}
            provider="google"
            pending={pendingProvider === "google"}
          />
          <SocialButton
            disabled={!authIsReady || pendingProvider !== null}
            label="Continue with GitHub"
            onClick={() => handleSocialAuth("github")}
            provider="github"
            pending={pendingProvider === "github"}
          />
        </div>

        {error ? (
          <p className="mt-4 w-full rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-sm text-red-400">
            {error}
          </p>
        ) : null}

        {/* Smart CAPTCHA mount point for Clerk's bot protection in custom flows. */}
        <div id="clerk-captcha" className="mt-4 empty:mt-0" />
      </div>
    </motion.div>
  );
}

function getAuthErrorMessage(authError: unknown) {
  if (authError instanceof Error) {
    return authError.message;
  }

  if (authError && typeof authError === "object") {
    const { code, longMessage, message } = authError as {
      code?: unknown;
      longMessage?: unknown;
      message?: unknown;
    };

    if (typeof longMessage === "string") {
      return longMessage;
    }

    if (typeof message === "string") {
      return message;
    }

    if (typeof code === "string") {
      return `Authentication failed (${code}).`;
    }
  }

  return "Authentication failed.";
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
      className={cn(
        "h-12 w-full justify-center gap-3 rounded-2xl border-stone-700/60 bg-stone-800/30 px-4 text-sm font-medium text-stone-200 shadow-none transition-[border-color,background-color,color] duration-200 hover:border-amber-500/25 hover:bg-stone-800/55 hover:text-stone-100 disabled:opacity-40",
        pending && "border-amber-500/25 bg-amber-500/[0.06]",
      )}
      disabled={disabled}
      onClick={onClick}
      size="lg"
      type="button"
      variant="outline"
    >
      {provider === "google" ? <GoogleMark /> : <GitHubMark />}
      <span>{label}</span>
      {pending ? (
        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-stone-500 border-t-amber-400" />
      ) : null}
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
      className="size-5 fill-stone-300"
      viewBox="0 0 24 24"
    >
      <path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.41-4.04-1.41-.55-1.4-1.34-1.77-1.34-1.77-1.1-.75.09-.73.09-.73 1.21.09 1.85 1.26 1.85 1.26 1.08 1.85 2.83 1.32 3.52 1 .11-.79.42-1.33.76-1.64-2.67-.3-5.48-1.34-5.48-5.97 0-1.32.47-2.39 1.25-3.24-.13-.3-.54-1.53.12-3.18 0 0 1.02-.33 3.35 1.24a11.64 11.64 0 0 1 6.1 0c2.32-1.57 3.34-1.24 3.34-1.24.67 1.65.26 2.88.13 3.18.78.85 1.24 1.92 1.24 3.24 0 4.64-2.81 5.66-5.49 5.96.43.37.82 1.11.82 2.24v3.32c0 .32.21.69.83.57A12 12 0 0 0 12 .5Z" />
    </svg>
  );
}
