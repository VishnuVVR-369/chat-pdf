import type { ReactNode } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon,
  ArrowUpRight01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Idea01Icon,
  InformationCircleIcon,
} from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";

/* Client islands re-exported so content modules import the whole kit
   from one place. A server module may re-export client components. */
export { CodeBlock } from "./CodeBlock";
export { Tabs } from "./Tabs";
export { Accordion } from "./Accordion";
export { Diagram } from "./Diagram";
export { SchemaDiagram } from "./SchemaDiagram";
export type {
  SchemaBadge,
  SchemaColumn,
  SchemaRelation,
  SchemaTable,
} from "./SchemaDiagram";

type IconType = typeof InformationCircleIcon;

/* ─── Callout ─────────────────────────────────────────────────────── */

type CalloutType = "note" | "tip" | "warning" | "check" | "danger" | "amber";

const calloutStyles: Record<
  CalloutType,
  { wrap: string; icon: IconType; iconColor: string; title: string }
> = {
  note: {
    wrap: "border-sky-400/20 bg-sky-400/[0.05]",
    icon: InformationCircleIcon,
    iconColor: "text-sky-300",
    title: "text-sky-100",
  },
  tip: {
    wrap: "border-emerald-400/20 bg-emerald-400/[0.05]",
    icon: Idea01Icon,
    iconColor: "text-emerald-300",
    title: "text-emerald-100",
  },
  warning: {
    wrap: "border-amber-400/25 bg-amber-400/[0.06]",
    icon: Alert02Icon,
    iconColor: "text-amber-300",
    title: "text-amber-100",
  },
  check: {
    wrap: "border-emerald-400/20 bg-emerald-400/[0.05]",
    icon: CheckmarkCircle02Icon,
    iconColor: "text-emerald-300",
    title: "text-emerald-100",
  },
  danger: {
    wrap: "border-red-400/20 bg-red-400/[0.05]",
    icon: Cancel01Icon,
    iconColor: "text-red-300",
    title: "text-red-100",
  },
  amber: {
    wrap: "border-amber-400/20 bg-amber-400/[0.06]",
    icon: InformationCircleIcon,
    iconColor: "text-amber-300",
    title: "text-amber-100",
  },
};

export function Callout({
  children,
  type = "amber",
  title,
}: {
  children: ReactNode;
  type?: CalloutType;
  title?: string;
}) {
  const style = calloutStyles[type];

  return (
    <div
      className={cn(
        "mt-5 flex gap-3 rounded-lg border p-4 text-sm leading-6 text-stone-200",
        style.wrap,
      )}
    >
      <HugeiconsIcon
        className={cn("mt-0.5 shrink-0", style.iconColor)}
        icon={style.icon}
        size={17}
        strokeWidth={1.8}
      />
      <div className="min-w-0">
        {title ? (
          <p className={cn("mb-1 font-semibold", style.title)}>{title}</p>
        ) : null}
        <div className="[&_code]:rounded [&_code]:bg-white/[0.08] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs">
          {children}
        </div>
      </div>
    </div>
  );
}

/* ─── Lists ───────────────────────────────────────────────────────── */

export function BulletList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mt-4 space-y-2.5 text-sm leading-6 text-stone-300">
      {items.map((item, index) => (
        <li className="flex gap-3" key={index}>
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300/80" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function StepList({
  items,
}: {
  items: Array<{ title: string; description: ReactNode }>;
}) {
  return (
    <ol className="mt-5 space-y-0">
      {items.map((item, index) => (
        <li
          className="relative grid grid-cols-[2rem_1fr] gap-4 pb-6 last:pb-0"
          key={item.title}
        >
          {index < items.length - 1 ? (
            <span className="absolute top-9 bottom-0 left-4 w-px -translate-x-1/2 bg-gradient-to-b from-amber-400/25 to-transparent" />
          ) : null}
          <span className="z-10 flex h-8 w-8 items-center justify-center rounded-md border border-amber-400/20 bg-amber-400/[0.08] font-mono text-xs text-amber-200">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="pt-1">
            <span className="block text-sm font-semibold text-stone-100">
              {item.title}
            </span>
            <span className="mt-1 block text-sm leading-6 text-stone-400">
              {item.description}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/* ─── Grids & cards ───────────────────────────────────────────────── */

export function InfoGrid({
  items,
  columns = 2,
}: {
  items: Array<{ title: string; description: ReactNode; icon?: IconType }>;
  columns?: 2 | 3;
}) {
  return (
    <div
      className={cn(
        "mt-5 grid gap-3",
        columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2",
      )}
    >
      {items.map((item) => (
        <div
          className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-4"
          key={item.title}
        >
          {item.icon ? (
            <HugeiconsIcon
              className="mb-2.5 text-amber-300"
              icon={item.icon}
              size={18}
              strokeWidth={1.8}
            />
          ) : null}
          <h3 className="text-sm font-semibold text-stone-100">{item.title}</h3>
          <p className="mt-1.5 text-sm leading-6 text-stone-400">
            {item.description}
          </p>
        </div>
      ))}
    </div>
  );
}

type CardItem = {
  title: string;
  description: ReactNode;
  href?: string;
  icon?: IconType;
};

export function CardGrid({
  items,
  columns = 2,
}: {
  items: CardItem[];
  columns?: 1 | 2 | 3;
}) {
  return (
    <div
      className={cn(
        "mt-5 grid gap-3",
        columns === 3
          ? "sm:grid-cols-3"
          : columns === 1
            ? "grid-cols-1"
            : "sm:grid-cols-2",
      )}
    >
      {items.map((item) => {
        const inner = (
          <>
            <div className="flex items-start justify-between gap-3">
              {item.icon ? (
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-400/15 bg-amber-400/[0.07] text-amber-300">
                  <HugeiconsIcon icon={item.icon} size={18} strokeWidth={1.8} />
                </span>
              ) : null}
              {item.href ? (
                <HugeiconsIcon
                  className="mt-1 text-stone-600 transition-colors group-hover/card:text-amber-300"
                  icon={ArrowUpRight01Icon}
                  size={16}
                  strokeWidth={1.8}
                />
              ) : null}
            </div>
            <h3 className="mt-3 text-sm font-semibold text-stone-100">
              {item.title}
            </h3>
            <p className="mt-1.5 text-sm leading-6 text-stone-400">
              {item.description}
            </p>
          </>
        );

        return item.href ? (
          <Link
            className="group/card rounded-xl border border-white/[0.07] bg-white/[0.025] p-4 transition-colors hover:border-amber-400/25 hover:bg-amber-400/[0.04]"
            href={item.href}
            key={item.title}
          >
            {inner}
          </Link>
        ) : (
          <div
            className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4"
            key={item.title}
          >
            {inner}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Score bars (retrieval weighting visual) ─────────────────────── */

export function ScoreBar({
  rows,
  caption,
}: {
  rows: Array<{ label: string; value: number; display?: string }>;
  caption?: string;
}) {
  return (
    <div className="mt-5 rounded-lg border border-white/[0.08] bg-white/[0.02] p-4">
      <div className="space-y-3">
        {rows.map((row) => (
          <div
            className="grid grid-cols-[7rem_1fr_3rem] items-center gap-3"
            key={row.label}
          >
            <span className="truncate text-xs text-stone-400">{row.label}</span>
            <span className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
              <span
                className="block h-full rounded-full bg-gradient-to-r from-amber-500/70 to-amber-300"
                style={{
                  width: `${Math.max(0, Math.min(1, row.value)) * 100}%`,
                }}
              />
            </span>
            <span className="text-right font-mono text-xs text-amber-200">
              {row.display ?? row.value.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
      {caption ? (
        <p className="mt-3 border-t border-white/[0.06] pt-3 text-xs leading-5 text-stone-500">
          {caption}
        </p>
      ) : null}
    </div>
  );
}

/* ─── Tables ──────────────────────────────────────────────────────── */

export function EnvTable({
  rows,
}: {
  rows: Array<{ name: string; purpose: string; required?: boolean }>;
}) {
  return (
    <div className="mt-5 overflow-hidden rounded-lg border border-white/[0.08]">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-white/[0.035] text-xs text-stone-500">
          <tr>
            <th className="px-4 py-3 font-medium">Variable</th>
            <th className="px-4 py-3 font-medium">Purpose</th>
            <th className="px-4 py-3 font-medium">Required</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06]">
          {rows.map((row) => (
            <tr key={row.name}>
              <td className="px-4 py-3 align-top font-mono text-xs whitespace-nowrap text-amber-200">
                {row.name}
              </td>
              <td className="px-4 py-3 align-top leading-6 text-stone-300">
                {row.purpose}
              </td>
              <td className="px-4 py-3 align-top text-stone-400">
                {row.required === false ? (
                  <span className="text-stone-500">Optional</span>
                ) : (
                  "Yes"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FieldTable({
  rows,
  caption,
}: {
  rows: Array<{ name: string; type: string; description: ReactNode }>;
  caption?: string;
}) {
  return (
    <div className="mt-5 overflow-hidden rounded-lg border border-white/[0.08]">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-white/[0.035] text-xs text-stone-500">
          <tr>
            <th className="px-4 py-3 font-medium">Field</th>
            <th className="px-4 py-3 font-medium">Type</th>
            <th className="px-4 py-3 font-medium">Description</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06]">
          {rows.map((row) => (
            <tr key={row.name}>
              <td className="px-4 py-3 align-top font-mono text-xs whitespace-nowrap text-amber-200">
                {row.name}
              </td>
              <td className="px-4 py-3 align-top font-mono text-xs whitespace-nowrap text-stone-400">
                {row.type}
              </td>
              <td className="px-4 py-3 align-top leading-6 text-stone-300">
                {row.description}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {caption ? (
        <p className="border-t border-white/[0.06] bg-white/[0.02] px-4 py-2.5 text-xs leading-5 text-stone-500">
          {caption}
        </p>
      ) : null}
    </div>
  );
}

/* ─── Inline pill (small inline metadata) ─────────────────────────── */

export function Pill({
  children,
  icon,
}: {
  children: ReactNode;
  icon?: IconType;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 align-middle font-mono text-xs text-stone-300">
      {icon ? <HugeiconsIcon icon={icon} size={12} strokeWidth={1.8} /> : null}
      {children}
    </span>
  );
}
