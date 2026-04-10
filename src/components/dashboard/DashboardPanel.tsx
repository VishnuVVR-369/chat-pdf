"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

type DashboardPanelProps = {
  email: string | null | undefined;
  name: string | null | undefined;
  tokenIdentifier: string;
};

export function DashboardPanel({
  email,
  name,
  tokenIdentifier,
}: DashboardPanelProps) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);

    try {
      await authClient.signOut();
      router.push("/sign-in");
      router.refresh();
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.14),_transparent_26%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_48%,_#f8fafc_100%)] px-6 py-10 text-slate-950">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="flex flex-col gap-4 rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_24px_90px_-32px_rgba(17,24,39,0.4)] backdrop-blur md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-700">
              Dashboard
            </p>
            <div className="space-y-1">
              <h1 className="text-3xl font-semibold tracking-tight">
                {name ? `Welcome, ${name}.` : "Welcome to ChatPDF."}
              </h1>
              <p className="text-sm text-slate-600">
                Your session is active and protected routes are working.
              </p>
            </div>
          </div>
          <Button
            className="rounded-full px-5"
            disabled={isSigningOut}
            onClick={handleSignOut}
            size="lg"
            variant="outline"
          >
            {isSigningOut ? "Signing out..." : "Sign out"}
          </Button>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          <InfoCard label="Display name" value={name ?? "No name returned"} />
          <InfoCard label="Email" value={email ?? "No email returned"} />
          <InfoCard label="Identity key" value={tokenIdentifier} />
          <InfoCard
            label="Route policy"
            value="Unauthenticated requests to /dashboard are redirected to /sign-in."
          />
        </section>
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.6rem] border border-slate-200/80 bg-white/85 p-5 shadow-[0_18px_50px_-28px_rgba(15,23,42,0.35)]">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 break-words text-base leading-7 text-slate-900">
        {value}
      </p>
    </div>
  );
}
