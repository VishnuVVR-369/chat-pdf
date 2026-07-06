"use client";

import { useSignIn } from "@clerk/nextjs";
import { ArrowRight02Icon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Button } from "@/components/ui/button";

const GENERIC_ERROR = "Guest sign-in failed. Please try again.";

function getAuthErrorMessage(authError: unknown) {
  if (authError instanceof Error) {
    return authError.message;
  }

  if (authError && typeof authError === "object") {
    const { longMessage, message } = authError as {
      longMessage?: unknown;
      message?: unknown;
    };

    if (typeof longMessage === "string") return longMessage;
    if (typeof message === "string") return message;
  }

  return GENERIC_ERROR;
}

export function GuestSignInCard() {
  const router = useRouter();
  const { fetchStatus, signIn } = useSignIn();
  const shouldReduceMotion = useReducedMotion();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const authIsReady = Boolean(signIn) && fetchStatus === "idle";

  const handleGuestSignIn = async () => {
    if (!signIn) {
      setError("Authentication is still loading. Please try again.");
      return;
    }

    setIsPending(true);
    setError(null);

    try {
      const response = await fetch("/api/guest-sign-in", {
        credentials: "include",
        method: "POST",
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setError(body?.message ?? GENERIC_ERROR);
        return;
      }

      const body = (await response.json()) as { ticket?: string };
      if (!body.ticket) {
        setError(GENERIC_ERROR);
        return;
      }

      const createResult = await signIn.create({
        strategy: "ticket",
        ticket: body.ticket,
      });

      if (createResult.error) {
        setError(getAuthErrorMessage(createResult.error));
        return;
      }

      const finalizeResult = await signIn.finalize();

      if (finalizeResult.error) {
        setError(getAuthErrorMessage(finalizeResult.error));
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch (signInError) {
      setError(getAuthErrorMessage(signInError));
    } finally {
      setIsPending(false);
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
        <div className="mt-6 flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-400/15 bg-amber-400/[0.08] text-amber-200">
          <HugeiconsIcon icon={UserGroupIcon} size={22} strokeWidth={1.8} />
        </div>
        <h1 className="mt-5 text-2xl font-bold tracking-tight text-stone-100">
          Guest access
        </h1>
        <p className="mt-2 text-sm leading-6 text-stone-400">
          Start a temporary session with all dashboard features enabled.
        </p>

        <Button
          className="mt-8 h-12 w-full justify-center gap-3 rounded-2xl border-amber-400/20 bg-amber-400 text-sm font-semibold text-[#090909] shadow-[0_16px_40px_-18px_rgba(245,158,11,0.75)] transition-[background-color,transform] hover:bg-amber-300 disabled:opacity-50"
          disabled={!authIsReady || isPending}
          onClick={handleGuestSignIn}
          size="lg"
          type="button"
        >
          <span>
            {isPending ? "Starting guest session..." : "Sign in as guest"}
          </span>
          {isPending ? (
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#090909]/25 border-t-[#090909]" />
          ) : (
            <HugeiconsIcon icon={ArrowRight02Icon} size={16} strokeWidth={2} />
          )}
        </Button>

        {error ? (
          <p className="mt-4 w-full rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-sm text-red-400">
            {error}
          </p>
        ) : null}

        <Link
          className="focus-ring mt-5 rounded-lg px-2 py-1 text-sm text-stone-500 transition-colors hover:text-stone-300"
          href="/sign-in"
        >
          Use Google or GitHub instead
        </Link>
      </div>
    </motion.div>
  );
}
