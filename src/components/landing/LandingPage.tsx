"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";

type LandingPageProps = {
  authenticated: boolean;
};

const stats = [
  { value: "Page-linked", label: "answers with citations" },
  { value: "OCR-ready", label: "for scanned PDFs too" },
  { value: "Fast setup", label: "from upload to insight" },
];

const proofPoints = [
  "Research papers",
  "Contracts",
  "Manuals",
  "Financial reports",
];

const features = [
  {
    title: "Upload anything",
    description:
      "Text-based or scanned PDFs are both supported. OCR extracts content from even the trickiest documents.",
    icon: (
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
    ),
  },
  {
    title: "Hybrid search",
    description:
      "Semantic understanding and keyword matching work together to surface the most relevant content across your files.",
    icon: (
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
    ),
  },
  {
    title: "Verified citations",
    description:
      "Every answer references exact pages and passages. Jump directly to the source in the original PDF.",
    icon: (
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
    ),
  },
];

const steps = [
  {
    number: "01",
    title: "Upload your PDFs",
    description:
      "Drag and drop any PDF. The pipeline processes, chunks, and indexes your documents automatically.",
  },
  {
    number: "02",
    title: "Ask questions",
    description:
      "Use natural language to query a single document or search across your entire library.",
  },
  {
    number: "03",
    title: "Get grounded answers",
    description:
      "Responses stay rooted in your documents, complete with page numbers and highlighted citations.",
  },
];

export function LandingPage({ authenticated }: LandingPageProps) {
  const shouldReduceMotion = useReducedMotion();

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
      <div className="pointer-events-none fixed left-1/2 top-0 h-[620px] w-[920px] -translate-x-1/2 rounded-full bg-amber-500/[0.045] blur-[140px]" />
      <div className="pointer-events-none fixed right-[-12%] top-[22%] h-[360px] w-[360px] rounded-full bg-orange-500/[0.035] blur-[130px]" />

      <div className="relative mx-auto max-w-6xl px-6">
        <motion.nav
          className="flex items-center justify-between py-6"
          initial={shouldReduceMotion ? false : { opacity: 0, y: -16 }}
          animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
        >
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

          <div className="flex items-center gap-3">
            <Button
              asChild
              variant="ghost"
              className="rounded-full border border-transparent text-stone-400 hover:border-stone-800 hover:bg-stone-900/60 hover:text-stone-100"
            >
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button
              asChild
              className="rounded-full bg-amber-500 px-5 font-semibold text-[#070707] hover:bg-amber-400"
            >
              <Link href="/sign-up">Get started</Link>
            </Button>
          </div>
        </motion.nav>

        <section className="pb-18 pt-20 text-center sm:pb-22 sm:pt-24">
          <FadeUp className="mb-6 inline-flex items-center gap-2.5 rounded-full border border-amber-500/20 bg-amber-500/[0.06] px-4 py-1.5 text-sm text-amber-400">
            <motion.span
              className="h-1.5 w-1.5 rounded-full bg-amber-400"
              animate={
                shouldReduceMotion
                  ? undefined
                  : { opacity: [0.5, 1, 0.5], scale: [1, 1.15, 1] }
              }
              transition={{
                duration: 2.4,
                repeat: Number.POSITIVE_INFINITY,
                ease: "easeInOut",
              }}
            />
            AI-powered document intelligence
          </FadeUp>

          <FadeUp
            delay={0.08}
            className="mx-auto max-w-4xl text-5xl font-bold leading-[1.03] tracking-[-0.04em] sm:text-7xl"
          >
            Your PDFs have answers.
            <br />
            <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-orange-400 bg-clip-text text-transparent">
              Start asking.
            </span>
          </FadeUp>

          <FadeUp
            delay={0.16}
            className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-stone-400"
          >
            Upload any PDF, from research papers to contracts and manuals, and
            get instant answers grounded in the document itself. Every response
            includes citations you can verify.
          </FadeUp>

          <FadeUp
            delay={0.24}
            className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <Button
              asChild
              size="lg"
              className="h-12 rounded-full bg-amber-500 px-8 text-base font-semibold text-[#070707] shadow-[0_25px_60px_-24px_rgba(245,158,11,0.95)] hover:bg-amber-400"
            >
              <Link href={authenticated ? "/dashboard" : "/sign-up"}>
                {authenticated ? "Open Dashboard" : "Start for free"}
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 rounded-full border-stone-700 bg-stone-900/35 px-8 text-base text-stone-300 hover:bg-stone-800/60 hover:text-stone-100"
            >
              <Link href="/sign-in">Sign in</Link>
            </Button>
          </FadeUp>

          <FadeUp
            delay={0.3}
            className="mt-5 text-xs text-stone-600"
          >
            Sign in with Google or GitHub · No credit card required
          </FadeUp>

          <FadeUp delay={0.36} className="mt-10 flex flex-wrap items-center justify-center gap-2.5">
            {proofPoints.map((item) => (
              <span
                key={item}
                className="rounded-full border border-stone-800/80 bg-stone-900/40 px-3.5 py-1.5 text-xs text-stone-400"
              >
                {item}
              </span>
            ))}
          </FadeUp>

          <FadeUp delay={0.42} className="mt-12 grid gap-3 text-left sm:grid-cols-3">
            {stats.map((stat, index) => (
              <HoverCard key={stat.label} delay={index * 0.04}>
                <div className="rounded-2xl border border-stone-800/80 bg-stone-900/35 p-5 backdrop-blur-sm">
                  <p className="text-sm font-medium text-amber-400">
                    {stat.value}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-stone-500">
                    {stat.label}
                  </p>
                </div>
              </HoverCard>
            ))}
          </FadeUp>
        </section>

        <RevealSection className="mx-auto max-w-5xl pb-28">
          <div className="relative rounded-[2rem] border border-stone-800/80 bg-[#0c0c0c]/95 p-1 shadow-[0_45px_140px_-24px_rgba(245,158,11,0.08)]">
            <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />

            <div className="flex items-center gap-1.5 border-b border-stone-800/60 px-4 py-3">
              <div className="h-2.5 w-2.5 rounded-full bg-stone-700/80" />
              <div className="h-2.5 w-2.5 rounded-full bg-stone-700/80" />
              <div className="h-2.5 w-2.5 rounded-full bg-stone-700/80" />
              <div className="ml-4 flex-1 rounded-md bg-stone-800/40 px-3 py-1 text-center text-[11px] text-stone-600">
                chatpdf.app/dashboard
              </div>
            </div>

            <div className="relative grid min-h-[380px] gap-0 md:grid-cols-[1fr_1.2fr]">
              <div className="border-b border-stone-800/60 p-5 md:border-b-0 md:border-r">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-5 w-5 items-center justify-center rounded bg-amber-500/15">
                      <div className="h-2.5 w-2.5 rounded-[3px] bg-amber-500/50" />
                    </div>
                    <span className="text-xs font-medium text-stone-500">
                      research-paper.pdf
                    </span>
                  </div>
                  <span className="rounded-full border border-amber-500/15 bg-amber-500/8 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-amber-400/90">
                    Indexed
                  </span>
                </div>

                <div className="space-y-2.5">
                  {Array.from({ length: 11 }, (_, index) => (
                    <div
                      key={index}
                      className="h-[5px] rounded-full bg-stone-800/80"
                      style={{ width: `${62 + Math.sin(index * 1.7) * 28}%` }}
                    />
                  ))}
                  <motion.div
                    className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-2.5"
                    animate={
                      shouldReduceMotion
                        ? undefined
                        : { boxShadow: ["0 0 0 rgba(245,158,11,0)", "0 0 0 1px rgba(245,158,11,0.15)", "0 0 0 rgba(245,158,11,0)"] }
                    }
                    transition={{
                      duration: 3.6,
                      repeat: Number.POSITIVE_INFINITY,
                      ease: "easeInOut",
                    }}
                  >
                    <div className="h-[5px] w-[92%] rounded-full bg-amber-500/25" />
                    <div className="mt-2 h-[5px] w-[68%] rounded-full bg-amber-500/18" />
                  </motion.div>
                  {Array.from({ length: 6 }, (_, index) => (
                    <div
                      key={`tail-${index}`}
                      className="h-[5px] rounded-full bg-stone-800/80"
                      style={{ width: `${48 + Math.sin(index * 2.1) * 32}%` }}
                    />
                  ))}
                </div>
              </div>

              <div className="relative flex flex-col p-5">
                <div className="pointer-events-none absolute right-4 top-4 z-20 hidden rounded-2xl border border-stone-700/70 bg-stone-900/70 px-4 py-3 text-left shadow-[0_24px_70px_-30px_rgba(0,0,0,0.95)] backdrop-blur-md sm:block">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                    Context found
                  </p>
                  <p className="mt-2 text-sm font-medium text-stone-200">
                    3 relevant sections
                  </p>
                  <p className="mt-1 text-xs text-stone-500">
                    Pages 12, 18, and appendix B
                  </p>
                </div>

                <div className="relative z-10 flex-1 space-y-4 pt-14 sm:pt-10">
                  <div className="flex justify-end">
                    <motion.div
                      className="origin-right max-w-[80%] rounded-2xl rounded-tr-sm border border-amber-500/20 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-200/80"
                      whileHover={
                        shouldReduceMotion
                          ? undefined
                          : {
                              scale: 1.015,
                              backgroundColor: "rgba(245, 158, 11, 0.14)",
                            }
                      }
                      transition={{ duration: 0.18, ease: "easeOut" }}
                    >
                      What were the key findings of this study?
                    </motion.div>
                  </div>
                  <div className="flex justify-start">
                    <motion.div
                      className="max-w-[85%] rounded-2xl rounded-tl-sm border border-stone-700/50 bg-stone-800/40 px-4 py-3 text-xs leading-relaxed text-stone-400"
                      whileHover={shouldReduceMotion ? undefined : { y: -2 }}
                    >
                      <p>The study identified three primary findings:</p>
                      <p className="mt-1.5">
                        1. Significant improvement in processing speed across
                        all test groups...
                      </p>
                      <div className="mt-2 flex items-center gap-2 text-[10px] text-amber-400/60">
                        <span>Page 12</span>
                        <span className="h-1 w-1 rounded-full bg-amber-400/40" />
                        <span>Paragraph 3</span>
                      </div>
                    </motion.div>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2 rounded-xl border border-stone-700/50 bg-stone-800/25 px-4 py-2.5">
                  <span className="flex-1 text-xs text-stone-600">
                    Ask about your document...
                  </span>
                  <motion.div
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500"
                    whileHover={shouldReduceMotion ? undefined : { scale: 1.06 }}
                    whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
                  >
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
                  </motion.div>
                </div>
              </div>
            </div>
          </div>
        </RevealSection>

        <section className="pb-28">
          <RevealSection className="mb-14 text-center">
            <p className="mb-3 text-sm font-medium uppercase tracking-[0.2em] text-amber-500/80">
              Capabilities
            </p>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Everything you need to understand your documents
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-stone-500">
              Focused answers, grounded citations, and a workspace that feels
              closer to analysis software than a generic chatbot.
            </p>
          </RevealSection>

          <div className="grid gap-4 sm:grid-cols-3">
            {features.map((feature, index) => (
              <RevealSection key={feature.title} delay={index * 0.08}>
                <HoverCard delay={index * 0.03}>
                  <div className="group h-full rounded-2xl border border-stone-800/70 bg-stone-900/30 p-6 transition-colors hover:border-stone-700/80 hover:bg-stone-900/50">
                    <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 transition-colors group-hover:bg-amber-500/15">
                      {feature.icon}
                    </div>
                    <h3 className="mb-2 text-base font-semibold tracking-tight">
                      {feature.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-stone-500">
                      {feature.description}
                    </p>
                  </div>
                </HoverCard>
              </RevealSection>
            ))}
          </div>
        </section>

        <section className="pb-28">
          <RevealSection className="mb-14 text-center">
            <p className="mb-3 text-sm font-medium uppercase tracking-[0.2em] text-amber-500/80">
              How it works
            </p>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Three steps to instant answers
            </h2>
          </RevealSection>

          <div className="grid gap-4 sm:grid-cols-3">
            {steps.map((step, index) => (
              <RevealSection key={step.number} delay={index * 0.08}>
                <HoverCard delay={index * 0.03}>
                  <div className="h-full rounded-2xl border border-stone-800/70 bg-[#0c0c0c] p-7">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-amber-500/15 bg-amber-500/8 text-xs font-semibold tracking-[0.18em] text-amber-500/75">
                        {step.number}
                      </span>
                      <div className="h-px flex-1 bg-gradient-to-r from-amber-500/20 to-transparent" />
                    </div>
                    <h3 className="mb-2 mt-5 text-base font-semibold tracking-tight">
                      {step.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-stone-500">
                      {step.description}
                    </p>
                  </div>
                </HoverCard>
              </RevealSection>
            ))}
          </div>
        </section>

        <RevealSection className="pb-24">
          <div className="relative overflow-hidden rounded-[2rem] border border-stone-800/70 bg-gradient-to-b from-stone-900/65 to-[#070707] px-8 py-18 text-center">
            <div className="pointer-events-none absolute left-1/2 top-0 h-44 w-[520px] -translate-x-1/2 rounded-full bg-amber-500/[0.07] blur-[90px]" />
            <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/35 to-transparent" />
            <h2 className="relative text-3xl font-bold tracking-tight sm:text-4xl">
              Ready to chat with your PDFs?
            </h2>
            <p className="relative mx-auto mb-8 mt-4 max-w-lg text-stone-500">
              Join researchers, lawyers, and professionals who save hours every
              week with faster document analysis and traceable answers.
            </p>
            <div className="relative flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="h-12 rounded-full bg-amber-500 px-8 text-base font-semibold text-[#070707] hover:bg-amber-400"
              >
                <Link href={authenticated ? "/dashboard" : "/sign-up"}>
                  {authenticated ? "Go to Dashboard" : "Get started free"}
                </Link>
              </Button>
              <span className="text-xs text-stone-600">
                Fast onboarding. No credit card required.
              </span>
            </div>
          </div>
        </RevealSection>

        <footer className="flex flex-col items-center justify-between gap-3 border-t border-stone-800/50 py-8 text-xs text-stone-600 sm:flex-row">
          <span>© 2026 ChatPDF</span>
          <div className="flex items-center gap-1.5">
            <span>Built with</span>
            <span className="text-amber-500">◆</span>
            <span>Convex &amp; Next.js</span>
          </div>
        </footer>
      </div>
    </main>
  );
}

function FadeUp({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 22 }}
      animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.65, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

function RevealSection({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 28 }}
      whileInView={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

function HoverCard({
  children,
  delay = 0,
}: {
  children: React.ReactNode;
  delay?: number;
}) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      whileHover={shouldReduceMotion ? undefined : { y: -6, scale: 1.01 }}
      transition={{ duration: 0.2, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
