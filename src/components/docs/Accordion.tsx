"use client";

import { type ReactNode } from "react";
import { Accordion as RadixAccordion } from "radix-ui";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";

type AccordionItem = {
  question: ReactNode;
  answer: ReactNode;
};

type AccordionProps = {
  items: AccordionItem[];
  className?: string;
};

export function Accordion({ items, className }: AccordionProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <RadixAccordion.Root
      className={cn(
        "mt-5 divide-y divide-white/[0.06] overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.02]",
        className,
      )}
      collapsible
      type="single"
    >
      {items.map((item, index) => (
        <RadixAccordion.Item key={index} value={`item-${index}`}>
          <RadixAccordion.Header className="flex">
            <RadixAccordion.Trigger
              className={cn(
                "group/acc flex flex-1 items-center justify-between gap-3 px-4 py-3.5 text-left text-sm font-medium text-stone-100 outline-none",
                "transition-colors hover:bg-white/[0.03] focus-visible:bg-white/[0.04]",
              )}
            >
              {item.question}
              <HugeiconsIcon
                className="shrink-0 text-stone-500 transition-transform duration-200 group-data-[state=open]/acc:rotate-180"
                icon={ArrowDown01Icon}
                size={16}
                strokeWidth={1.8}
              />
            </RadixAccordion.Trigger>
          </RadixAccordion.Header>
          <RadixAccordion.Content className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden">
            <div className="px-4 pb-4 text-sm leading-7 text-stone-400">
              {item.answer}
            </div>
          </RadixAccordion.Content>
        </RadixAccordion.Item>
      ))}
    </RadixAccordion.Root>
  );
}
