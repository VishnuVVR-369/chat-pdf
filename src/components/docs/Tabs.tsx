"use client";

import { useId, type ReactNode } from "react";
import { Tabs as RadixTabs } from "radix-ui";

import { cn } from "@/lib/utils";

type TabItem = {
  label: string;
  content: ReactNode;
};

type TabsProps = {
  items: TabItem[];
  className?: string;
};

export function Tabs({ items, className }: TabsProps) {
  const id = useId();

  if (items.length === 0) {
    return null;
  }

  return (
    <RadixTabs.Root
      className={cn(
        "mt-5 overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.02]",
        className,
      )}
      defaultValue={`${id}-0`}
    >
      <RadixTabs.List className="flex gap-1 overflow-x-auto border-b border-white/[0.07] bg-black/30 p-1">
        {items.map((item, index) => (
          <RadixTabs.Trigger
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap text-stone-400 transition-colors outline-none",
              "hover:text-stone-100 focus-visible:ring-1 focus-visible:ring-amber-300/40",
              "data-[state=active]:bg-amber-400/[0.1] data-[state=active]:text-amber-100 data-[state=active]:ring-1 data-[state=active]:ring-amber-400/20",
            )}
            key={item.label}
            value={`${id}-${index}`}
          >
            {item.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {items.map((item, index) => (
        <RadixTabs.Content
          className="px-4 py-4 text-sm leading-7 text-stone-300 outline-none focus-visible:ring-1 focus-visible:ring-amber-300/30"
          key={item.label}
          value={`${id}-${index}`}
        >
          {item.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}
