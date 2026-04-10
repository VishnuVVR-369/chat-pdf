import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { isAuthenticated } from "@/lib/auth-server";

export default async function SignInPage() {
  if (await isAuthenticated()) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.16),_transparent_26%),linear-gradient(180deg,_#f8fafc_0%,_#eff6ff_55%,_#f8fafc_100%)] px-6 py-10">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] w-full max-w-6xl items-center gap-10 lg:grid-cols-[1fr_0.95fr]">
        <section className="space-y-6">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-700">
            Sign in
          </p>
          <div className="space-y-4">
            <h1 className="max-w-2xl text-5xl font-semibold tracking-[-0.04em] text-balance text-slate-950">
              Return to the dashboard without exposing private routes.
            </h1>
            <p className="max-w-xl text-lg leading-8 text-slate-600">
              Use your Google or GitHub account. Successful authentication sends
              you straight to `/dashboard`.
            </p>
          </div>
        </section>
        <AuthCard mode="sign-in" />
      </div>
    </main>
  );
}
