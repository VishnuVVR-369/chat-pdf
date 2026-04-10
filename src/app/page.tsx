import Link from "next/link";
import { Button } from "@/components/ui/button";
import { isAuthenticated } from "@/lib/auth-server";

export default async function Home() {
  const authenticated = await isAuthenticated();

  return (
    <main className="relative min-h-screen bg-[#070707] text-stone-100 selection:bg-amber-500/30 selection:text-amber-200">
      {/* Subtle cross-dot pattern */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.035]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      />

      {/* Top ambient glow */}
      <div className="pointer-events-none fixed left-1/2 top-0 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-amber-500/[0.035] blur-[140px]" />

      <div className="relative mx-auto max-w-6xl px-6">
        {/* ── Navigation ── */}
        <nav className="flex items-center justify-between py-6 animate-lp-fade-in">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500">
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
            <span className="text-lg font-semibold tracking-tight">
              ChatPDF
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <Button
              asChild
              variant="ghost"
              className="text-stone-400 hover:text-stone-100 rounded-full"
            >
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button
              asChild
              className="bg-amber-500 text-[#070707] hover:bg-amber-400 rounded-full px-5 font-semibold"
            >
              <Link href="/sign-up">Get started</Link>
            </Button>
          </div>
        </nav>

        {/* ── Hero ── */}
        <section className="flex flex-col items-center pb-20 pt-24 text-center">
          <div className="animate-lp-fade-in-up mb-6 inline-flex items-center gap-2.5 rounded-full border border-amber-500/20 bg-amber-500/[0.06] px-4 py-1.5 text-sm text-amber-400">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
            AI&#8209;powered document intelligence
          </div>

          <h1 className="animate-lp-fade-in-up [animation-delay:100ms] max-w-4xl text-5xl font-bold leading-[1.08] tracking-[-0.035em] sm:text-7xl">
            Your PDFs have answers.
            <br />
            <span className="bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">
              Start asking.
            </span>
          </h1>

          <p className="animate-lp-fade-in-up [animation-delay:200ms] mt-7 max-w-2xl text-lg leading-relaxed text-stone-400">
            Upload any PDF&nbsp;&mdash; research papers, contracts,
            manuals&nbsp;&mdash; and get instant, accurate answers grounded
            entirely in your documents. Every response includes citations you
            can verify.
          </p>

          <div className="animate-lp-fade-in-up [animation-delay:300ms] mt-10 flex flex-col gap-3 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="h-12 rounded-full bg-amber-500 px-8 text-base font-semibold text-[#070707] hover:bg-amber-400"
            >
              <Link href={authenticated ? "/dashboard" : "/sign-up"}>
                {authenticated ? "Open Dashboard" : "Start for free"}
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 rounded-full border-stone-700 px-8 text-base text-stone-300 hover:bg-stone-800/60 hover:text-stone-100"
            >
              <Link href="/sign-in">Sign in</Link>
            </Button>
          </div>

          <p className="animate-lp-fade-in-up [animation-delay:400ms] mt-5 text-xs text-stone-600">
            Sign in with Google or GitHub&ensp;·&ensp;No credit card required
          </p>
        </section>

        {/* ── Interface Preview ── */}
        <section className="animate-lp-fade-in-up [animation-delay:500ms] mx-auto max-w-4xl pb-32">
          <div className="relative rounded-2xl border border-stone-800/80 bg-[#0c0c0c] p-1 shadow-[0_40px_120px_-20px_rgba(245,158,11,0.06)]">
            {/* Window chrome */}
            <div className="flex items-center gap-1.5 border-b border-stone-800/60 px-4 py-3">
              <div className="h-2.5 w-2.5 rounded-full bg-stone-700/80" />
              <div className="h-2.5 w-2.5 rounded-full bg-stone-700/80" />
              <div className="h-2.5 w-2.5 rounded-full bg-stone-700/80" />
              <div className="ml-4 flex-1 rounded-md bg-stone-800/40 px-3 py-1 text-center text-[11px] text-stone-600">
                chatpdf.app/dashboard
              </div>
            </div>

            {/* Mock split view */}
            <div className="grid min-h-[340px] grid-cols-[1fr_1.2fr]">
              {/* PDF pane */}
              <div className="border-r border-stone-800/60 p-5">
                <div className="mb-4 flex items-center gap-2">
                  <div className="flex h-5 w-5 items-center justify-center rounded bg-amber-500/15">
                    <div className="h-2.5 w-2.5 rounded-[3px] bg-amber-500/50" />
                  </div>
                  <span className="text-xs font-medium text-stone-500">
                    research&#8209;paper.pdf
                  </span>
                </div>
                <div className="space-y-2.5">
                  {Array.from({ length: 11 }, (_, i) => (
                    <div
                      key={i}
                      className="h-[5px] rounded-full bg-stone-800/80"
                      style={{ width: `${62 + Math.sin(i * 1.7) * 28}%` }}
                    />
                  ))}
                  {/* highlighted chunk */}
                  <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-2.5">
                    <div className="h-[5px] w-[92%] rounded-full bg-amber-500/25" />
                    <div className="mt-2 h-[5px] w-[68%] rounded-full bg-amber-500/18" />
                  </div>
                  {Array.from({ length: 6 }, (_, i) => (
                    <div
                      key={`b${i}`}
                      className="h-[5px] rounded-full bg-stone-800/80"
                      style={{ width: `${48 + Math.sin(i * 2.1) * 32}%` }}
                    />
                  ))}
                </div>
              </div>

              {/* Chat pane */}
              <div className="flex flex-col p-5">
                <div className="flex-1 space-y-4">
                  <div className="flex justify-end">
                    <div className="max-w-[80%] rounded-2xl rounded-tr-sm border border-amber-500/20 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-200/80">
                      What were the key findings of this study?
                    </div>
                  </div>
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-stone-700/50 bg-stone-800/40 px-4 py-3 text-xs leading-relaxed text-stone-400">
                      <p>The study identified three primary findings:</p>
                      <p className="mt-1.5">
                        1.&nbsp;Significant improvement in processing speed
                        across all test groups&hellip;
                      </p>
                      <p className="mt-2 text-[10px] text-amber-400/60">
                        📄 Page&nbsp;12 · Paragraph&nbsp;3
                      </p>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-stone-700/50 bg-stone-800/25 px-4 py-2.5">
                  <span className="flex-1 text-xs text-stone-600">
                    Ask about your document…
                  </span>
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500">
                    <svg
                      className="h-3 w-3 text-[#070707]"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Features ── */}
        <section className="pb-32">
          <div className="mb-14 text-center">
            <p className="mb-3 text-sm font-medium uppercase tracking-[0.2em] text-amber-500/80">
              Capabilities
            </p>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Everything you need to understand your documents
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <FeatureCard
              icon={
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              }
              title="Upload anything"
              description="Text-based or scanned PDFs — we handle both. OCR extracts content from even the trickiest documents."
            />
            <FeatureCard
              icon={
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  <line x1="8" y1="11" x2="14" y2="11" />
                  <line x1="11" y1="8" x2="11" y2="14" />
                </svg>
              }
              title="Hybrid search"
              description="Combines semantic understanding with keyword matching to surface the most relevant content across all your files."
            />
            <FeatureCard
              icon={
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              }
              title="Verified citations"
              description="Every answer references exact pages and passages. Click a citation to jump directly to the source in your PDF."
            />
          </div>
        </section>

        {/* ── How it works ── */}
        <section className="pb-32">
          <div className="mb-14 text-center">
            <p className="mb-3 text-sm font-medium uppercase tracking-[0.2em] text-amber-500/80">
              How it works
            </p>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Three steps to instant answers
            </h2>
          </div>

          <div className="grid gap-px overflow-hidden rounded-2xl border border-stone-800/80 bg-stone-800/40 sm:grid-cols-3">
            <StepCard
              number="01"
              title="Upload your PDFs"
              description="Drag and drop any PDF. Our pipeline processes, chunks, and indexes your documents automatically."
            />
            <StepCard
              number="02"
              title="Ask questions"
              description="Type a question in natural language. Query a single document or search across your entire library."
            />
            <StepCard
              number="03"
              title="Get grounded answers"
              description="Receive accurate responses rooted in your documents — with page numbers and highlighted citations."
            />
          </div>
        </section>

        {/* ── Bottom CTA ── */}
        <section className="pb-24">
          <div className="relative overflow-hidden rounded-3xl border border-stone-800/70 bg-gradient-to-b from-stone-900/60 to-[#070707] px-8 py-20 text-center">
            {/* decorative glow */}
            <div className="pointer-events-none absolute left-1/2 top-0 h-40 w-[500px] -translate-x-1/2 rounded-full bg-amber-500/[0.06] blur-[80px]" />
            <h2 className="relative text-3xl font-bold tracking-tight sm:text-4xl">
              Ready to chat with your PDFs?
            </h2>
            <p className="relative mx-auto mb-8 mt-4 max-w-lg text-stone-500">
              Join researchers, lawyers, and professionals who save hours every
              week with AI&#8209;powered document analysis.
            </p>
            <Button
              asChild
              size="lg"
              className="relative h-12 rounded-full bg-amber-500 px-8 text-base font-semibold text-[#070707] hover:bg-amber-400"
            >
              <Link href={authenticated ? "/dashboard" : "/sign-up"}>
                {authenticated ? "Go to Dashboard" : "Get started free"}
              </Link>
            </Button>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer className="flex items-center justify-between border-t border-stone-800/50 py-8 text-xs text-stone-600">
          <span>&copy; 2026 ChatPDF</span>
          <div className="flex items-center gap-1.5">
            <span>Built with</span>
            <span className="text-amber-500">&#x25C6;</span>
            <span>Convex &amp; Next.js</span>
          </div>
        </footer>
      </div>

      {/* Keyframe animations */}
      <style>{`
        @keyframes lp-fade-in {
          from { opacity: 0 }
          to   { opacity: 1 }
        }
        @keyframes lp-fade-in-up {
          from { opacity: 0; transform: translateY(22px) }
          to   { opacity: 1; transform: translateY(0) }
        }
        .animate-lp-fade-in     { animation: lp-fade-in 0.6s ease-out both }
        .animate-lp-fade-in-up  { animation: lp-fade-in-up 0.7s ease-out both }
      `}</style>
    </main>
  );
}

/* ── Sub-components ── */

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="group rounded-2xl border border-stone-800/70 bg-stone-900/30 p-6 transition-colors hover:border-stone-700/80 hover:bg-stone-900/50">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 transition-colors group-hover:bg-amber-500/15">
        {icon}
      </div>
      <h3 className="mb-2 text-base font-semibold tracking-tight">{title}</h3>
      <p className="text-sm leading-relaxed text-stone-500">{description}</p>
    </div>
  );
}

function StepCard({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-[#0c0c0c] p-7">
      <span className="text-xs font-semibold tracking-[0.18em] text-amber-500/70">
        {number}
      </span>
      <h3 className="mb-2 mt-3 text-base font-semibold tracking-tight">
        {title}
      </h3>
      <p className="text-sm leading-relaxed text-stone-500">{description}</p>
    </div>
  );
}
