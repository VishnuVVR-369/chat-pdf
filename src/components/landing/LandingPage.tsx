"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { motion, type Variants } from "motion/react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Button } from "@/components/ui/button";

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Docs", href: "/docs" },
];

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

const builtOn = ["Convex", "Next.js", "OpenAI", "Mistral OCR 4", "Clerk"];

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

const docsCards = [
  {
    eyebrow: "Get started",
    title: "Quickstart & first PDF",
    description:
      "Go from a fresh account to your first grounded answer in a couple of minutes.",
    href: "/docs",
  },
  {
    eyebrow: "Using ChatPDF",
    title: "Uploading, asking & citations",
    description:
      "Learn the dashboard, how questions are answered, and how citations link back to the page.",
    href: "/docs/using-chatpdf/dashboard",
  },
  {
    eyebrow: "Platform",
    title: "Architecture & retrieval",
    description:
      "The processing pipeline, hybrid retrieval, ranking, and how authentication works.",
    href: "/docs/platform/architecture",
  },
  {
    eyebrow: "Self-hosting",
    title: "Configure & deploy",
    description:
      "Environment variables, local development, and shipping your own instance to production.",
    href: "/docs/self-hosting/configuration",
  },
];

const ease = [0.22, 1, 0.36, 1] as const;

const container: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease } },
};

function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, ease, delay }}
    >
      {children}
    </motion.div>
  );
}

export function LandingPage() {
  return (
    <main className="relative min-h-screen overflow-x-clip bg-[#070707] text-stone-100 selection:bg-amber-500/30 selection:text-amber-200">
      {/* ── Atmosphere ──────────────────────────────────── */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fillRule='evenodd'%3E%3Cg fill='%23ffffff' fillOpacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
        }}
      />
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.5]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.025) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage:
            "radial-gradient(ellipse 80% 50% at 50% 0%, black 30%, transparent 75%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 50% at 50% 0%, black 30%, transparent 75%)",
        }}
      />
      <div className="pointer-events-none fixed inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
      <div className="pointer-events-none fixed top-[-120px] left-1/2 h-[680px] w-[980px] -translate-x-1/2 rounded-full bg-amber-500/[0.06] blur-[150px]" />
      <div className="pointer-events-none fixed top-[20%] right-[-12%] h-[380px] w-[380px] rounded-full bg-orange-500/[0.04] blur-[130px]" />
      <div className="pointer-events-none fixed bottom-[-10%] left-[-10%] h-[420px] w-[420px] rounded-full bg-amber-600/[0.03] blur-[150px]" />

      {/* ── Nav ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50">
        <div className="border-b border-white/[0.04] bg-[#070707]/70 backdrop-blur-xl">
          <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
            <Link href="/" className="transition-opacity hover:opacity-80">
              <BrandLogo priority />
            </Link>

            <div className="hidden items-center gap-1 md:flex">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-full px-3.5 py-1.5 text-sm text-stone-400 transition-colors hover:text-stone-100"
                >
                  {link.label}
                </Link>
              ))}
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <Button
                asChild
                variant="ghost"
                className="hidden rounded-full border border-transparent px-4 text-stone-400 hover:border-stone-800 hover:bg-stone-900/60 hover:text-stone-100 sm:inline-flex"
              >
                <Link href="/sign-in">Sign in</Link>
              </Button>
              <Button
                asChild
                className="rounded-full bg-amber-500 px-4 font-semibold text-[#070707] hover:bg-amber-400 sm:px-5"
              >
                <Link href="/guest-sign-in">Sign in as guest</Link>
              </Button>
            </div>
          </nav>
        </div>
      </header>

      <div className="relative mx-auto max-w-6xl px-6">
        {/* ── Hero ──────────────────────────────────────── */}
        <motion.section
          variants={container}
          initial="hidden"
          animate="show"
          className="pt-16 pb-14 text-center sm:pt-24 sm:pb-18 md:pt-28 md:pb-22"
        >
          <motion.div variants={fadeUp}>
            <span className="inline-flex items-center gap-2.5 rounded-full border border-amber-500/20 bg-amber-500/[0.06] px-4 py-1.5 font-mono text-xs tracking-wide text-amber-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
              AI-powered document intelligence
            </span>
          </motion.div>

          <motion.h1
            variants={fadeUp}
            className="mx-auto mt-6 max-w-4xl text-[2.6rem] leading-[1.06] font-bold tracking-[-0.035em] sm:text-5xl md:text-7xl md:leading-[1.02]"
          >
            Your PDFs have answers.
            <br />
            <span className="bg-gradient-to-r from-amber-200 via-amber-400 to-orange-400 bg-clip-text text-transparent">
              Start asking.
            </span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-stone-400 sm:mt-7 sm:text-lg"
          >
            Upload any PDF, from research papers to contracts and manuals, and
            get instant answers grounded in the document itself. Every response
            includes citations you can verify.
          </motion.p>

          <motion.div
            variants={fadeUp}
            className="mt-8 flex flex-col items-center justify-center gap-3 sm:mt-10 sm:flex-row"
          >
            <Button
              asChild
              size="lg"
              className="h-12 w-full rounded-full bg-amber-500 px-8 text-base font-semibold text-[#070707] shadow-[0_25px_60px_-24px_rgba(245,158,11,0.95)] transition-shadow hover:bg-amber-400 hover:shadow-[0_30px_80px_-20px_rgba(245,158,11,0.7)] sm:w-auto"
            >
              <Link href="/guest-sign-in">Try as guest</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 w-full rounded-full border-stone-700 bg-stone-900/35 px-8 text-base text-stone-300 hover:bg-stone-800/60 hover:text-stone-100 sm:w-auto"
            >
              <Link href="/sign-in">Sign in normally</Link>
            </Button>
          </motion.div>

          <motion.p variants={fadeUp} className="mt-5 text-xs text-stone-600">
            Guest sessions are rate-limited · Google and GitHub sign-in still
            available
          </motion.p>

          <motion.div
            variants={fadeUp}
            className="mt-8 flex items-center justify-center gap-3"
          >
            <div className="flex -space-x-2">
              {[
                "bg-amber-500/80",
                "bg-orange-400/80",
                "bg-amber-600/80",
                "bg-stone-500/80",
                "bg-amber-400/80",
              ].map((bg, index) => (
                <div
                  key={bg}
                  className={`flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#070707] text-[10px] font-semibold text-[#070707] ${bg}`}
                >
                  {["R", "A", "S", "K", "M"][index]}
                </div>
              ))}
            </div>
            <p className="text-sm text-stone-500">
              Trusted by <span className="text-stone-300">researchers</span>{" "}
              &amp; <span className="text-stone-300">professionals</span>
            </p>
          </motion.div>

          <motion.div
            variants={fadeUp}
            className="mt-8 flex flex-wrap items-center justify-center gap-2.5"
          >
            {proofPoints.map((item) => (
              <span
                key={item}
                className="rounded-full border border-stone-800/80 bg-stone-900/40 px-3.5 py-1.5 text-xs text-stone-400"
              >
                {item}
              </span>
            ))}
          </motion.div>

          <motion.div
            variants={fadeUp}
            className="mt-10 grid gap-3 text-left sm:mt-12 sm:grid-cols-3"
          >
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-stone-800/80 bg-stone-900/35 p-5 backdrop-blur-sm transition-transform duration-200 hover:-translate-y-1"
              >
                <p className="font-mono text-sm font-medium text-amber-400">
                  {stat.value}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-stone-500">
                  {stat.label}
                </p>
              </div>
            ))}
          </motion.div>
        </motion.section>

        {/* ── Product mockup ────────────────────────────── */}
        <Reveal className="mx-auto max-w-5xl pb-16 sm:pb-24">
          <div className="relative rounded-[2rem] border border-stone-800/80 bg-[#0c0c0c]/95 p-1 shadow-[0_45px_140px_-24px_rgba(245,158,11,0.1)]">
            <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />

            <div className="flex items-center gap-1.5 border-b border-stone-800/60 px-4 py-3">
              <div className="h-2.5 w-2.5 rounded-full bg-stone-700/80" />
              <div className="h-2.5 w-2.5 rounded-full bg-stone-700/80" />
              <div className="h-2.5 w-2.5 rounded-full bg-stone-700/80" />
              <div className="ml-4 flex-1 rounded-md bg-stone-800/40 px-3 py-1 text-center font-mono text-[11px] text-stone-600">
                chatpdf.app/dashboard
              </div>
            </div>

            <div className="relative grid min-h-[380px] gap-0 md:grid-cols-[1fr_1.2fr]">
              <div className="border-b border-stone-800/60 p-5 md:border-r md:border-b-0">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-5 w-5 items-center justify-center rounded bg-amber-500/15">
                      <div className="h-2.5 w-2.5 rounded-[3px] bg-amber-500/50" />
                    </div>
                    <span className="font-mono text-xs font-medium text-stone-500">
                      research-paper.pdf
                    </span>
                  </div>
                  <span className="rounded-full border border-amber-500/15 bg-amber-500/8 px-2.5 py-1 font-mono text-[10px] font-medium tracking-[0.16em] text-amber-400/90 uppercase">
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
                  <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-2.5 shadow-[0_0_0_1px_rgba(245,158,11,0.12)]">
                    <div className="h-[5px] w-[92%] rounded-full bg-amber-500/25" />
                    <div className="mt-2 h-[5px] w-[68%] rounded-full bg-amber-500/18" />
                  </div>
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
                <div className="pointer-events-none absolute top-4 right-4 z-20 hidden rounded-2xl border border-stone-700/70 bg-stone-900/70 px-4 py-3 text-left shadow-[0_24px_70px_-30px_rgba(0,0,0,0.95)] backdrop-blur-md sm:block">
                  <p className="font-mono text-[10px] font-semibold tracking-[0.18em] text-stone-500 uppercase">
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
                    <div className="max-w-[80%] rounded-2xl rounded-tr-sm border border-amber-500/20 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-200/80">
                      What were the key findings of this study?
                    </div>
                  </div>
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-stone-700/50 bg-stone-800/40 px-4 py-3 text-xs leading-relaxed text-stone-400">
                      <p>The study identified three primary findings:</p>
                      <p className="mt-1.5">
                        1. Significant improvement in processing speed across
                        all test groups...
                      </p>
                      <div className="mt-2 flex items-center gap-2 font-mono text-[10px] text-amber-400/60">
                        <span>Page 12</span>
                        <span className="h-1 w-1 rounded-full bg-amber-400/40" />
                        <span>Paragraph 3</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2 rounded-xl border border-stone-700/50 bg-stone-800/25 px-4 py-2.5">
                  <span className="flex-1 text-xs text-stone-600">
                    Ask about your document...
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
        </Reveal>

        {/* ── Built on ──────────────────────────────────── */}
        <Reveal className="pb-16 sm:pb-24">
          <p className="text-center font-mono text-[11px] tracking-[0.22em] text-stone-600 uppercase">
            Built on a modern stack
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 sm:gap-x-12">
            {builtOn.map((name) => (
              <span
                key={name}
                className="text-sm font-medium tracking-tight text-stone-500 transition-colors hover:text-stone-300"
              >
                {name}
              </span>
            ))}
          </div>
        </Reveal>

        {/* ── Features ──────────────────────────────────── */}
        <section id="features" className="scroll-mt-24 pb-16 sm:pb-28">
          <Reveal className="mb-10 text-center sm:mb-14">
            <p className="mb-3 font-mono text-xs tracking-[0.2em] text-amber-500/80 uppercase">
              Capabilities
            </p>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">
              Everything you need to understand your documents
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-stone-500">
              Focused answers, grounded citations, and a workspace that feels
              closer to analysis software than a generic chatbot.
            </p>
          </Reveal>

          <div className="grid gap-4 sm:grid-cols-3">
            {features.map((feature, index) => (
              <Reveal key={feature.title} delay={index * 0.08}>
                <div className="group h-full rounded-2xl border border-stone-800/70 bg-stone-900/30 p-6 transition-[transform,border-color,background-color] duration-200 hover:-translate-y-1.5 hover:border-amber-500/25 hover:bg-stone-900/50">
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
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── How it works ──────────────────────────────── */}
        <section id="how-it-works" className="scroll-mt-24 pb-16 sm:pb-28">
          <Reveal className="mb-10 text-center sm:mb-14">
            <p className="mb-3 font-mono text-xs tracking-[0.2em] text-amber-500/80 uppercase">
              How it works
            </p>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">
              Three steps to instant answers
            </h2>
          </Reveal>

          <div className="grid gap-4 sm:grid-cols-3">
            {steps.map((step, index) => (
              <Reveal key={step.number} delay={index * 0.08}>
                <div className="h-full rounded-2xl border border-stone-800/70 bg-[#0c0c0c] p-7 transition-transform duration-200 hover:-translate-y-1">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full border border-amber-500/15 bg-amber-500/8 font-mono text-xs font-semibold tracking-[0.18em] text-amber-500/75">
                      {step.number}
                    </span>
                    <div className="h-px flex-1 bg-gradient-to-r from-amber-500/20 to-transparent" />
                  </div>
                  <h3 className="mt-5 mb-2 text-base font-semibold tracking-tight">
                    {step.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-stone-500">
                    {step.description}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── Documentation ─────────────────────────────── */}
        <section id="docs" className="scroll-mt-24 pb-16 sm:pb-28">
          <Reveal className="mb-10 flex flex-col items-start justify-between gap-5 sm:mb-12 sm:flex-row sm:items-end">
            <div className="max-w-xl">
              <p className="mb-3 font-mono text-xs tracking-[0.2em] text-amber-500/80 uppercase">
                Documentation
              </p>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">
                Read the docs, ship your own
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-stone-500">
                Everything from a two-minute quickstart to the retrieval
                pipeline internals and a full self-hosting guide.
              </p>
            </div>
            <Button
              asChild
              variant="outline"
              className="rounded-full border-stone-700 bg-stone-900/35 px-5 text-sm text-stone-300 hover:bg-stone-800/60 hover:text-stone-100"
            >
              <Link href="/docs">
                Browse all docs
                <svg
                  className="ml-1.5 h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </Link>
            </Button>
          </Reveal>

          <div className="grid gap-4 sm:grid-cols-2">
            {docsCards.map((card, index) => (
              <Reveal key={card.href} delay={index * 0.06}>
                <Link
                  href={card.href}
                  className="group flex h-full flex-col rounded-2xl border border-stone-800/70 bg-stone-900/30 p-6 transition-[transform,border-color,background-color] duration-200 hover:-translate-y-1 hover:border-amber-500/25 hover:bg-stone-900/50"
                >
                  <p className="font-mono text-[11px] tracking-[0.18em] text-amber-500/70 uppercase">
                    {card.eyebrow}
                  </p>
                  <h3 className="mt-3 flex items-center gap-2 text-base font-semibold tracking-tight text-stone-100">
                    {card.title}
                    <svg
                      className="h-4 w-4 -translate-x-1 text-stone-600 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:text-amber-400 group-hover:opacity-100"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-stone-500">
                    {card.description}
                  </p>
                </Link>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── Final CTA ─────────────────────────────────── */}
        <Reveal className="pb-24">
          <div className="relative overflow-hidden rounded-2xl border border-stone-800/70 bg-gradient-to-b from-stone-900/65 to-[#070707] px-6 py-12 text-center sm:rounded-[2rem] sm:px-8 sm:py-18">
            <div className="pointer-events-none absolute top-0 left-1/2 h-44 w-[520px] -translate-x-1/2 rounded-full bg-amber-500/[0.08] blur-[90px]" />
            <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/35 to-transparent" />
            <h2 className="relative text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">
              Stop searching. Start understanding.
            </h2>
            <p className="relative mx-auto mt-4 mb-8 max-w-lg text-sm text-stone-500 sm:text-base">
              Every hour spent searching PDFs manually is an hour lost to actual
              analysis. Join professionals who made the switch.
            </p>
            <div className="relative flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="h-12 w-full rounded-full bg-amber-500 px-8 text-base font-semibold text-[#070707] transition-shadow hover:bg-amber-400 hover:shadow-[0_30px_80px_-20px_rgba(245,158,11,0.7)] sm:w-auto"
              >
                <Link href="/guest-sign-in">Open guest demo</Link>
              </Button>
              <span className="text-xs text-stone-600">
                Rate-limited guest sessions
              </span>
            </div>
          </div>
        </Reveal>

        {/* ── Footer ────────────────────────────────────── */}
        <footer className="border-t border-stone-800/50 py-12">
          <div className="grid gap-8 sm:grid-cols-[1.4fr_1fr_1fr]">
            <div>
              <BrandLogo />
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-stone-600">
                Ask your PDFs anything and get answers grounded in the document,
                with citations you can verify.
              </p>
            </div>

            <div>
              <p className="font-mono text-[11px] tracking-[0.18em] text-stone-500 uppercase">
                Product
              </p>
              <ul className="mt-4 space-y-2.5 text-sm text-stone-500">
                <li>
                  <Link href="#features" className="hover:text-stone-200">
                    Features
                  </Link>
                </li>
                <li>
                  <Link href="#how-it-works" className="hover:text-stone-200">
                    How it works
                  </Link>
                </li>
                <li>
                  <Link href="/sign-in" className="hover:text-stone-200">
                    Sign in
                  </Link>
                </li>
                <li>
                  <Link href="/guest-sign-in" className="hover:text-stone-200">
                    Guest sign in
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <p className="font-mono text-[11px] tracking-[0.18em] text-stone-500 uppercase">
                Documentation
              </p>
              <ul className="mt-4 space-y-2.5 text-sm text-stone-500">
                <li>
                  <Link href="/docs" className="hover:text-stone-200">
                    Get started
                  </Link>
                </li>
                <li>
                  <Link
                    href="/docs/platform/architecture"
                    className="hover:text-stone-200"
                  >
                    Architecture
                  </Link>
                </li>
                <li>
                  <Link
                    href="/docs/self-hosting/configuration"
                    className="hover:text-stone-200"
                  >
                    Self-hosting
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-stone-800/50 pt-6 text-xs text-stone-600 sm:flex-row">
            <span>© 2026 ChatPDF</span>
            <div className="flex items-center gap-1.5">
              <span>Built with</span>
              <span className="text-amber-500">◆</span>
              <span>Convex &amp; Next.js</span>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}
