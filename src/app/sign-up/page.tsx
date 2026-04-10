import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { isAuthenticated } from "@/lib/auth-server";

export default async function SignUpPage() {
  if (await isAuthenticated()) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_right,_rgba(45,212,191,0.2),_transparent_24%),linear-gradient(180deg,_#f0fdf4_0%,_#ecfeff_48%,_#f8fafc_100%)] px-6 py-10">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] w-full max-w-6xl items-center gap-10 lg:grid-cols-[1fr_0.95fr]">
        <section className="space-y-6">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-700">
            Sign up
          </p>
          <div className="space-y-4">
            <h1 className="max-w-2xl text-5xl font-semibold tracking-[-0.04em] text-balance text-slate-950">
              Create an account with the provider you already trust.
            </h1>
            <p className="max-w-xl text-lg leading-8 text-slate-600">
              New users can onboard with Google or GitHub and land directly in
              the protected dashboard after OAuth completes.
            </p>
          </div>
        </section>
        <AuthCard mode="sign-up" />
      </div>
    </main>
  );
}
