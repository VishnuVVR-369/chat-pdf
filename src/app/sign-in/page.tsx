import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { isAuthenticated } from "@/lib/auth-server";

export default async function SignInPage() {
  if (await isAuthenticated()) {
    redirect("/dashboard");
  }

  return (
    <main className="relative min-h-screen bg-[#070707] text-stone-100 selection:bg-amber-500/30 selection:text-amber-200">
      {/* Background texture */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.035]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      />
      <div className="pointer-events-none fixed left-1/2 top-0 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-amber-500/[0.03] blur-[120px]" />

      <div className="relative mx-auto max-w-6xl px-6">
        {/* Nav */}
        <nav className="flex items-center justify-between py-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500">
              <svg className="h-4 w-4 text-[#070707]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
            <span className="text-lg font-semibold tracking-tight">ChatPDF</span>
          </Link>
          <Link
            href="/sign-up"
            className="text-sm text-stone-500 transition hover:text-stone-300"
          >
            Create an account &rarr;
          </Link>
        </nav>

        {/* Content */}
        <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center">
          <div className="grid w-full max-w-4xl items-center gap-16 lg:grid-cols-[1.1fr_1fr]">
            <section className="space-y-6">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-amber-500/80">
                Sign in
              </p>
              <div className="space-y-4">
                <h1 className="text-4xl font-bold leading-[1.1] tracking-[-0.03em] sm:text-5xl">
                  Welcome back to your
                  <span className="bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent"> workspace</span>.
                </h1>
                <p className="max-w-md text-base leading-relaxed text-stone-500">
                  Sign in with your Google or GitHub account and pick up right where you left off.
                </p>
              </div>
              <div className="flex items-center gap-4 rounded-xl border border-stone-800/60 bg-stone-900/30 px-4 py-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
                  <svg className="h-4 w-4 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-medium text-stone-300">Secure OAuth</p>
                  <p className="text-[11px] text-stone-600">We never see or store your password</p>
                </div>
              </div>
            </section>
            <div className="flex justify-center lg:justify-end">
              <AuthCard mode="sign-in" />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
