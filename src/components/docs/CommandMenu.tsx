"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, VisuallyHidden } from "radix-ui";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, Search01Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";

type DocsSearchItem = {
  title: string;
  description: string;
  group: string;
  href: string;
};

type CommandMenuProps = {
  items: DocsSearchItem[];
  className?: string;
};

export function CommandMenu({ items, className }: CommandMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(false);

  const results = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) {
      return items;
    }
    return items.filter((item) =>
      `${item.title} ${item.description} ${item.group}`
        .toLowerCase()
        .includes(value),
    );
  }, [items, query]);

  const handleOpenChange = useCallback((next: boolean) => {
    openRef.current = next;
    if (next) {
      setQuery("");
      setActiveIndex(0);
    }
    setOpen(next);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        handleOpenChange(!openRef.current);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleOpenChange]);

  const navigate = useCallback(
    (href: string) => {
      openRef.current = false;
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const target = results[activeIndex];
      if (target) {
        navigate(target.href);
      }
    }
  }

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${activeIndex}"]`,
    );
    node?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <Dialog.Root onOpenChange={handleOpenChange} open={open}>
      <Dialog.Trigger asChild>
        <button
          className={cn(
            "flex h-10 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-stone-500 transition-colors hover:border-white/[0.14] hover:text-stone-300",
            className,
          )}
          type="button"
        >
          <HugeiconsIcon icon={Search01Icon} size={16} strokeWidth={1.8} />
          <span className="flex-1 text-left">Search docs</span>
          <kbd className="hidden items-center gap-0.5 rounded border border-white/[0.1] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[0.65rem] text-stone-500 sm:inline-flex">
            ⌘K
          </kbd>
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="data-[state=open]:animate-in data-[state=open]:fade-in fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
        <Dialog.Content
          className="data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95 fixed top-[12vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-white/[0.1] bg-[#101010] shadow-[0_32px_120px_-24px_rgba(0,0,0,0.95)]"
          onOpenAutoFocus={(event) => {
            // Keep focus management to our input below.
            event.preventDefault();
          }}
        >
          <VisuallyHidden.Root>
            <Dialog.Title>Search documentation</Dialog.Title>
            <Dialog.Description>
              Find a page in the ChatPDF documentation.
            </Dialog.Description>
          </VisuallyHidden.Root>

          <div className="flex h-12 items-center gap-3 border-b border-white/[0.08] px-4 text-stone-400">
            <HugeiconsIcon icon={Search01Icon} size={18} strokeWidth={1.8} />
            <input
              autoFocus
              className="h-full flex-1 bg-transparent text-sm text-stone-100 outline-none placeholder:text-stone-600"
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={onInputKeyDown}
              placeholder="Search documentation…"
              value={query}
            />
            <kbd className="rounded border border-white/[0.1] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[0.65rem] text-stone-500">
              Esc
            </kbd>
          </div>

          <div
            className="max-h-[min(24rem,60vh)] overflow-y-auto p-1.5"
            ref={listRef}
          >
            {results.length > 0 ? (
              results.map((item, index) => (
                <button
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                    index === activeIndex
                      ? "bg-amber-400/[0.1]"
                      : "hover:bg-white/[0.05]",
                  )}
                  data-index={index}
                  key={item.href}
                  onClick={() => navigate(item.href)}
                  onMouseEnter={() => setActiveIndex(index)}
                  type="button"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.7rem] tracking-wide text-amber-300/70 uppercase">
                      {item.group}
                    </span>
                    <span className="mt-0.5 block truncate text-sm font-medium text-stone-100">
                      {item.title}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-stone-500">
                      {item.description}
                    </span>
                  </span>
                  <HugeiconsIcon
                    className={cn(
                      "shrink-0 transition-colors",
                      index === activeIndex
                        ? "text-amber-300"
                        : "text-stone-700",
                    )}
                    icon={ArrowRight01Icon}
                    size={16}
                    strokeWidth={1.8}
                  />
                </button>
              ))
            ) : (
              <div className="px-4 py-10 text-center text-sm text-stone-500">
                No results for “{query}”.
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
