import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  BookOpen01Icon,
  Database01Icon,
  DashboardCircleSettingsIcon,
  HashtagIcon,
  Home01Icon,
  Rocket01Icon,
} from "@hugeicons/core-free-icons";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { CommandMenu } from "@/components/docs/CommandMenu";
import { Reveal } from "@/components/docs/Reveal";
import { TableOfContents } from "@/components/docs/TableOfContents";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  docsGroups,
  docsSearchItems,
  getDocsPath,
  type DocsPage,
} from "@/lib/docs";

type DocsShellProps = {
  page: DocsPage;
  previous?: DocsPage;
  next?: DocsPage;
};

const groupIcons = {
  "Get started": Rocket01Icon,
  "Using ChatPDF": BookOpen01Icon,
  Platform: DashboardCircleSettingsIcon,
  "Self-hosting": Home01Icon,
  Reference: Database01Icon,
};

export function DocsShell({ page, previous, next }: DocsShellProps) {
  return (
    <main className="min-h-screen bg-[#070707] text-stone-100 selection:bg-amber-500/30 selection:text-amber-100">
      <div className="pointer-events-none fixed inset-0 [background-image:linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] [background-size:48px_48px] opacity-[0.035]" />
      <div className="pointer-events-none fixed inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/45 to-transparent" />

      <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-[#070707]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[90rem] items-center gap-4 px-4 sm:px-6">
          <Link className="shrink-0" href="/">
            <BrandLogo
              logoClassName="h-8 w-8"
              textClassName="text-base"
              priority
            />
          </Link>
          <div className="hidden h-5 w-px bg-white/[0.08] md:block" />
          <Link
            className="hidden rounded-md px-2 py-1 text-sm text-stone-400 transition-colors hover:bg-white/[0.045] hover:text-stone-100 md:block"
            href="/docs"
          >
            Docs
          </Link>
          <CommandMenu
            className="ml-auto hidden w-full max-w-md md:flex"
            items={docsSearchItems}
          />
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <Button
              asChild
              className="hidden border-stone-800 bg-stone-950/50 text-stone-300 hover:bg-stone-900 hover:text-stone-100 sm:inline-flex"
              size="sm"
              variant="outline"
            >
              <Link href="/">Home</Link>
            </Button>
            <Button
              asChild
              className="bg-amber-400 text-[#070707] hover:bg-amber-300"
              size="sm"
            >
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          </div>
        </div>
        <div className="border-t border-white/[0.06] px-4 py-3 md:hidden">
          <CommandMenu className="w-full" items={docsSearchItems} />
        </div>
      </header>

      <div className="relative mx-auto grid max-w-[90rem] grid-cols-1 gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[17rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1fr)_14rem]">
        <aside className="hidden lg:block">
          <DocsSidebar currentSlug={page.slug} />
        </aside>

        <div className="min-w-0">
          <MobileDocsNav currentSlug={page.slug} />
          <DocsArticle page={page} />
          <DocsPager next={next} previous={previous} />
        </div>

        <aside className="hidden xl:block">
          <div className="sticky top-24">
            <TableOfContents
              sections={page.sections.map((section) => ({
                id: section.id,
                title: section.title,
              }))}
            />
          </div>
        </aside>
      </div>
    </main>
  );
}

function DocsSidebar({ currentSlug }: { currentSlug: string }) {
  return (
    <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-2">
      <nav className="space-y-7">
        {docsGroups.map((group) => {
          const Icon = groupIcons[group.title as keyof typeof groupIcons];

          return (
            <section key={group.title}>
              <div className="mb-2 flex items-center gap-2 px-2 text-xs font-medium text-stone-500">
                <HugeiconsIcon icon={Icon} size={14} strokeWidth={1.8} />
                {group.title}
              </div>
              <div className="space-y-0.5">
                {group.pages.map((item) => {
                  const isActive = item.slug === currentSlug;

                  return (
                    <Link
                      className={cn(
                        "block rounded-md px-2.5 py-1.5 text-sm transition-colors",
                        isActive
                          ? "bg-amber-400/[0.09] text-amber-100 ring-1 ring-amber-400/15"
                          : "text-stone-400 hover:bg-white/[0.045] hover:text-stone-100",
                      )}
                      href={getDocsPath(item)}
                      key={item.slug}
                    >
                      {item.title}
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </nav>
    </div>
  );
}

function MobileDocsNav({ currentSlug }: { currentSlug: string }) {
  return (
    <div className="mb-6 overflow-x-auto border-b border-white/[0.07] pb-4 lg:hidden">
      <div className="flex min-w-max gap-2">
        {docsGroups.flatMap((group) =>
          group.pages.map((item) => {
            const isActive = item.slug === currentSlug;

            return (
              <Link
                className={cn(
                  "rounded-md border px-3 py-2 text-sm whitespace-nowrap transition-colors",
                  isActive
                    ? "border-amber-400/25 bg-amber-400/[0.09] text-amber-100"
                    : "border-white/[0.08] bg-white/[0.035] text-stone-400",
                )}
                href={getDocsPath(item)}
                key={item.slug}
              >
                {item.title}
              </Link>
            );
          }),
        )}
      </div>
    </div>
  );
}

function Breadcrumbs({ page }: { page: DocsPage }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="mb-5 flex items-center gap-1.5 text-xs text-stone-500"
    >
      <Link className="transition-colors hover:text-stone-300" href="/docs">
        Docs
      </Link>
      <HugeiconsIcon icon={ArrowRight01Icon} size={12} strokeWidth={2} />
      <span>{page.group}</span>
      <HugeiconsIcon icon={ArrowRight01Icon} size={12} strokeWidth={2} />
      <span className="text-stone-300">{page.title}</span>
    </nav>
  );
}

function DocsArticle({ page }: { page: DocsPage }) {
  return (
    <article className="mx-auto max-w-3xl">
      <Breadcrumbs page={page} />
      <div className="mb-10 border-b border-white/[0.08] pb-10">
        <div className="mb-5 inline-flex items-center gap-2 rounded-md border border-amber-400/20 bg-amber-400/[0.07] px-2.5 py-1 text-xs font-medium text-amber-200">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
          {page.eyebrow}
        </div>
        <h1 className="text-4xl leading-tight font-semibold tracking-normal text-stone-50 md:text-5xl">
          {page.title}
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-stone-400">
          {page.description}
        </p>

        {page.quickFacts ? (
          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            {page.quickFacts.map((fact) => (
              <div
                className="rounded-lg border border-white/[0.07] bg-white/[0.035] p-4"
                key={fact.label}
              >
                <p className="text-xs text-stone-500">{fact.label}</p>
                <p className="mt-2 text-sm font-semibold text-stone-100">
                  {fact.value}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        {page.highlights ? (
          <div className="mt-7 grid gap-3">
            {page.highlights.map((item) => {
              const content = (
                <>
                  <span>
                    <span className="block text-sm font-semibold text-stone-100">
                      {item.title}
                    </span>
                    <span className="mt-1 block text-sm leading-6 text-stone-400">
                      {item.description}
                    </span>
                  </span>
                  <HugeiconsIcon
                    className="mt-1 text-amber-300"
                    icon={ArrowRight01Icon}
                    size={16}
                    strokeWidth={1.8}
                  />
                </>
              );

              return item.href ? (
                <Link
                  className="flex items-start justify-between gap-4 rounded-lg border border-white/[0.07] bg-white/[0.035] p-4 transition-colors hover:border-amber-400/20 hover:bg-amber-400/[0.055]"
                  href={item.href}
                  key={item.title}
                >
                  {content}
                </Link>
              ) : (
                <div
                  className="flex items-start justify-between gap-4 rounded-lg border border-white/[0.07] bg-white/[0.035] p-4"
                  key={item.title}
                >
                  {content}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="space-y-12">
        {page.sections.map((section) => (
          <section
            className="scroll-mt-24 border-b border-white/[0.06] pb-10 last:border-b-0"
            id={section.id}
            key={section.id}
          >
            <Reveal>
              <a
                className="group flex items-center gap-2 no-underline"
                href={`#${section.id}`}
              >
                <h2 className="text-xl font-semibold tracking-normal text-stone-50">
                  {section.title}
                </h2>
                <HugeiconsIcon
                  className="text-stone-600 opacity-0 transition-opacity group-hover:opacity-100"
                  icon={HashtagIcon}
                  size={15}
                  strokeWidth={1.8}
                />
              </a>
              <div className="mt-3 text-sm leading-7 text-stone-300 [&_:not(pre)>code]:rounded-md [&_:not(pre)>code]:bg-white/[0.06] [&_:not(pre)>code]:px-1.5 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-xs [&_:not(pre)>code]:text-amber-100 [&_a]:text-amber-200 [&_a]:underline [&_a]:decoration-amber-300/25 [&_a]:underline-offset-4">
                {section.body}
              </div>
            </Reveal>
          </section>
        ))}
      </div>
    </article>
  );
}

function DocsPager({
  previous,
  next,
}: {
  previous?: DocsPage;
  next?: DocsPage;
}) {
  if (!previous && !next) {
    return null;
  }

  return (
    <nav className="mx-auto mt-12 grid max-w-3xl gap-3 border-t border-white/[0.07] pt-8 sm:grid-cols-2">
      {previous ? (
        <Link
          className="group flex items-center gap-3.5 rounded-xl border border-white/[0.08] bg-white/[0.025] p-5 transition-all duration-200 hover:border-amber-400/20 hover:bg-amber-400/[0.05]"
          href={getDocsPath(previous)}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] transition-all duration-200 group-hover:border-amber-400/25 group-hover:bg-amber-400/[0.09]">
            <HugeiconsIcon
              className="text-stone-500 transition-colors duration-200 group-hover:text-amber-300"
              icon={ArrowLeft01Icon}
              size={16}
              strokeWidth={1.8}
            />
          </div>
          <div className="min-w-0">
            <span className="text-xs font-medium tracking-wide text-stone-500 uppercase transition-colors duration-200 group-hover:text-amber-400/80">
              Previous
            </span>
            <span className="mt-0.5 block truncate text-sm font-medium text-stone-300 transition-colors duration-200 group-hover:text-stone-100">
              {previous.title}
            </span>
          </div>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link
          className="group flex items-center justify-end gap-3.5 rounded-xl border border-white/[0.08] bg-white/[0.025] p-5 text-right transition-all duration-200 hover:border-amber-400/20 hover:bg-amber-400/[0.05]"
          href={getDocsPath(next)}
        >
          <div className="min-w-0">
            <span className="text-xs font-medium tracking-wide text-stone-500 uppercase transition-colors duration-200 group-hover:text-amber-400/80">
              Next
            </span>
            <span className="mt-0.5 block truncate text-sm font-medium text-stone-300 transition-colors duration-200 group-hover:text-stone-100">
              {next.title}
            </span>
          </div>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] transition-all duration-200 group-hover:border-amber-400/25 group-hover:bg-amber-400/[0.09]">
            <HugeiconsIcon
              className="text-stone-500 transition-colors duration-200 group-hover:text-amber-300"
              icon={ArrowRight01Icon}
              size={16}
              strokeWidth={1.8}
            />
          </div>
        </Link>
      ) : null}
    </nav>
  );
}
