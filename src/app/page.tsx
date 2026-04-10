import Link from "next/link";
import { Button } from "@/components/ui/button";
import { isAuthenticated } from "@/lib/auth-server";

export default async function Home() {
  const authenticated = await isAuthenticated();

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.18),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(45,212,191,0.2),_transparent_30%),linear-gradient(180deg,_#f8fafc_0%,_#e0f2fe_48%,_#eef2ff_100%)] px-6 py-8 text-slate-950">
      <div className="absolute left-[-10rem] top-20 size-80 rounded-full bg-cyan-300/20 blur-3xl" />
      <div className="absolute right-[-8rem] top-1/3 size-72 rounded-full bg-emerald-300/20 blur-3xl" />
      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl flex-col">
        <header className="flex items-center justify-between rounded-full border border-white/60 bg-white/70 px-5 py-3 shadow-[0_18px_60px_-30px_rgba(15,23,42,0.4)] backdrop-blur">
          <Link className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-700" href="/">
            ChatPDF
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild className="rounded-full px-5" variant="ghost">
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button asChild className="rounded-full px-5" size="lg">
              <Link href="/sign-up">Sign up</Link>
            </Button>
          </div>
        </header>

        <section className="grid flex-1 items-center gap-10 py-16 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-8">
            <div className="space-y-4">
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-700">
                Public landing page
              </p>
              <h1 className="max-w-3xl text-5xl font-semibold tracking-[-0.04em] text-balance sm:text-6xl">
                Turn a stack of PDFs into a searchable, focused workspace.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-slate-600">
                Keep the homepage open to everyone, route authenticated users into
                a protected dashboard, and use Google or GitHub to get started in
                a single step.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild className="h-12 rounded-full px-6 text-base" size="lg">
                <Link href={authenticated ? "/dashboard" : "/sign-up"}>
                  {authenticated ? "Open dashboard" : "Create account"}
                </Link>
              </Button>
              <Button
                asChild
                className="h-12 rounded-full px-6 text-base"
                size="lg"
                variant="outline"
              >
                <Link href="/sign-in">Sign in</Link>
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <MetricCard label="Auth providers" value="Google + GitHub" />
              <MetricCard label="Public route" value="Landing page stays open" />
              <MetricCard label="Protected route" value="/dashboard" />
            </div>
          </div>

          <div className="rounded-[2.2rem] border border-white/70 bg-white/80 p-6 shadow-[0_28px_100px_-34px_rgba(15,23,42,0.45)] backdrop-blur">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
                    Access flow
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                    The route behavior is explicit.
                  </h2>
                </div>
                <div className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                  {authenticated ? "Authenticated" : "Guest"}
                </div>
              </div>

              <FlowStep
                index="01"
                text="Anyone can open `/` and navigate to sign-in or sign-up."
              />
              <FlowStep
                index="02"
                text="OAuth completion redirects successful sessions to `/dashboard`."
              />
              <FlowStep
                index="03"
                text="Direct unauthenticated requests to `/dashboard` are redirected to `/sign-in`."
              />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.5rem] border border-white/70 bg-white/75 p-4 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.45)] backdrop-blur">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 text-lg font-semibold tracking-tight text-slate-950">
        {value}
      </p>
    </div>
  );
}

function FlowStep({ index, text }: { index: string; text: string }) {
  return (
    <div className="flex gap-4 rounded-[1.4rem] border border-slate-200/80 bg-slate-50/90 p-4">
      <span className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-700">
        {index}
      </span>
      <p className="text-sm leading-7 text-slate-700">{text}</p>
    </div>
  );
}
