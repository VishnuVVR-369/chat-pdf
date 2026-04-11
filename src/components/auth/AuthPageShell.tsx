import Link from "next/link";

type AuthPageShellProps = {
  alternateHref: string;
  alternateLabel: string;
  badge: string;
  children: React.ReactNode;
  description: string;
  highlights: Array<{
    description: string;
    title: string;
  }>;
  kicker: string;
  title: React.ReactNode;
};

export function AuthPageShell({
  alternateHref,
  alternateLabel,
  badge,
  children,
  description,
  highlights,
  kicker,
  title,
}: AuthPageShellProps) {
  return (
    <main className="relative min-h-screen overflow-x-clip bg-[#070707] text-stone-100 selection:bg-amber-500/30 selection:text-amber-200">
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fillRule='evenodd'%3E%3Cg fill='%23ffffff' fillOpacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
        }}
      />
      <div className="pointer-events-none fixed inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/35 to-transparent" />
      <div className="pointer-events-none fixed left-1/2 top-0 h-[560px] w-[860px] -translate-x-1/2 rounded-full bg-amber-500/[0.04] blur-[130px]" />
      <div className="pointer-events-none fixed left-[-10%] top-[30%] h-[320px] w-[320px] rounded-full bg-orange-500/[0.03] blur-[120px]" />

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-6">
        <nav className="flex items-center justify-between py-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 shadow-[0_12px_30px_-12px_rgba(245,158,11,0.9)]">
              <svg
                className="h-4 w-4 text-[#070707]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
            <span className="text-lg font-semibold tracking-tight">ChatPDF</span>
          </Link>

          <Link
            href={alternateHref}
            className="rounded-full border border-stone-800/80 bg-stone-900/35 px-3.5 py-2 text-xs text-stone-400 transition hover:border-stone-700 hover:bg-stone-900/60 hover:text-stone-200 sm:px-4 sm:text-sm"
          >
            {alternateLabel}
          </Link>
        </nav>

        <div className="flex flex-1 items-center py-8 sm:py-12">
          <div className="grid w-full gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,420px)] lg:items-center lg:gap-12">
            <section className="max-w-2xl text-center lg:text-left">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/[0.06] px-4 py-1.5 text-sm text-amber-400">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                {badge}
              </div>

              <p className="mt-8 hidden text-sm font-medium uppercase tracking-[0.22em] text-amber-500/80 lg:block">
                {kicker}
              </p>

              <h1 className="mt-4 text-3xl font-bold leading-[1.08] tracking-[-0.03em] text-stone-100 sm:text-4xl lg:text-6xl lg:leading-[1.03]">
                {title}
              </h1>

              <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-stone-400 sm:text-base lg:mx-0 lg:mt-6 lg:text-lg">
                {description}
              </p>

              <div className="mt-8 hidden flex-wrap gap-2.5 lg:flex">
                <span className="rounded-full border border-stone-800/80 bg-stone-900/40 px-3.5 py-1.5 text-xs text-stone-400">
                  Google
                </span>
                <span className="rounded-full border border-stone-800/80 bg-stone-900/40 px-3.5 py-1.5 text-xs text-stone-400">
                  GitHub
                </span>
                <span className="rounded-full border border-stone-800/80 bg-stone-900/40 px-3.5 py-1.5 text-xs text-stone-400">
                  One-click access
                </span>
              </div>

              <div className="mt-10 hidden gap-4 lg:grid lg:grid-cols-3">
                {highlights.map((highlight) => (
                  <div
                    key={highlight.title}
                    className="rounded-2xl border border-stone-800/75 bg-stone-900/30 p-5 backdrop-blur-sm"
                  >
                    <p className="text-sm font-medium text-amber-400">
                      {highlight.title}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-stone-500">
                      {highlight.description}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-8 hidden overflow-hidden rounded-[1.75rem] border border-stone-800/75 bg-gradient-to-b from-stone-900/65 to-[#0b0b0b] lg:block">
                <div className="border-b border-stone-800/70 px-5 py-4">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full bg-stone-700/80" />
                    <div className="h-2.5 w-2.5 rounded-full bg-stone-700/80" />
                    <div className="h-2.5 w-2.5 rounded-full bg-stone-700/80" />
                    <div className="ml-3 text-[11px] uppercase tracking-[0.18em] text-stone-600">
                      Authentication
                    </div>
                  </div>
                </div>

                <div className="grid gap-6 p-6 sm:grid-cols-[1.2fr_0.95fr]">
                  <div>
                    <p className="text-sm font-medium text-stone-300">
                      Fast, secure access to your document workspace
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-stone-500">
                      Continue with your provider, land in the dashboard, and
                      keep every upload, citation, and conversation in one
                      place.
                    </p>

                    <div className="mt-5 space-y-3">
                      <div className="rounded-xl border border-stone-800/80 bg-stone-950/40 px-4 py-3">
                        <div className="flex items-center justify-between text-xs text-stone-500">
                          <span>Workspace access</span>
                          <span className="text-amber-400">Protected</span>
                        </div>
                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-stone-800">
                          <div className="h-full w-[82%] rounded-full bg-gradient-to-r from-amber-500 to-orange-400" />
                        </div>
                      </div>

                      <div className="rounded-xl border border-stone-800/80 bg-stone-950/40 px-4 py-3">
                        <div className="flex items-center justify-between text-xs text-stone-500">
                          <span>Onboarding friction</span>
                          <span className="text-stone-300">Minimal</span>
                        </div>
                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-stone-800">
                          <div className="h-full w-[26%] rounded-full bg-gradient-to-r from-stone-300 to-stone-500" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[1.4rem] border border-stone-800/75 bg-stone-950/60 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                      Why it feels better
                    </p>
                    <div className="mt-4 space-y-3">
                      <div className="rounded-xl border border-amber-500/15 bg-amber-500/[0.05] px-4 py-3">
                        <p className="text-sm font-medium text-stone-200">
                          No passwords to manage
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-stone-500">
                          Use an identity provider you already trust.
                        </p>
                      </div>
                      <div className="rounded-xl border border-stone-800/80 bg-stone-900/40 px-4 py-3">
                        <p className="text-sm font-medium text-stone-200">
                          Faster return sessions
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-stone-500">
                          Re-enter the dashboard without extra friction.
                        </p>
                      </div>
                      <div className="rounded-xl border border-stone-800/80 bg-stone-900/40 px-4 py-3">
                        <p className="text-sm font-medium text-stone-200">
                          Clean handoff into work
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-stone-500">
                          Authentication stays lightweight so the product stays
                          front and center.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <div className="flex justify-center lg:justify-end">{children}</div>
          </div>
        </div>
      </div>
    </main>
  );
}
