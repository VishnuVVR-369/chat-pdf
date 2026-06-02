"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

type TocSection = {
  id: string;
  title: string;
};

export function TableOfContents({ sections }: { sections: TocSection[] }) {
  const [activeId, setActiveId] = useState<string>(sections[0]?.id ?? "");

  useEffect(() => {
    if (sections.length === 0) {
      return;
    }

    const elements = sections
      .map((section) => document.getElementById(section.id))
      .filter((element): element is HTMLElement => element !== null);

    const visible = new Map<string, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visible.set(entry.target.id, entry.intersectionRatio);
          } else {
            visible.delete(entry.target.id);
          }
        }

        if (visible.size > 0) {
          const topId = [...visible.entries()].sort(
            (a, b) => b[1] - a[1],
          )[0][0];
          setActiveId((prev) => (prev === topId ? prev : topId));
        }
      },
      {
        // Bias the active region toward the top third of the viewport.
        rootMargin: "-10% 0px -70% 0px",
        threshold: [0, 0.25, 0.5, 1],
      },
    );

    for (const element of elements) {
      observer.observe(element);
    }

    return () => observer.disconnect();
  }, [sections]);

  if (sections.length === 0) {
    return null;
  }

  return (
    <nav aria-label="On this page">
      <p className="text-xs font-medium tracking-wide text-stone-500 uppercase">
        On this page
      </p>
      <ul className="mt-3 space-y-0.5 border-l border-white/[0.08]">
        {sections.map((section) => {
          const isActive = section.id === activeId;
          return (
            <li key={section.id}>
              <a
                className={cn(
                  "-ml-px block border-l-2 py-1.5 pl-3 text-sm transition-colors",
                  isActive
                    ? "border-amber-400 text-amber-100"
                    : "border-transparent text-stone-500 hover:border-white/20 hover:text-stone-300",
                )}
                href={`#${section.id}`}
              >
                {section.title}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
