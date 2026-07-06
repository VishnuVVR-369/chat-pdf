"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Key01Icon } from "@hugeicons/core-free-icons";
import { motion } from "motion/react";

import { cn } from "@/lib/utils";

type IconType = typeof Key01Icon;

/**
 * A card-based entity-relationship view of the Convex data model.
 *
 * Purely presentational: the table/column/relation data is passed in from the
 * docs content so the schema description lives next to the rest of the copy.
 * Tuned against the #070707 / amber-400 docs surface.
 */

export type SchemaBadge = "pk" | "fk" | "index" | "vector" | "search" | "owner";

export type SchemaColumn = {
  name: string;
  type: string;
  /** Table this column points at (renders a foreign-key reference). */
  ref?: string;
  badges?: SchemaBadge[];
  /** Column is nullable / stored only for part of the lifecycle. */
  optional?: boolean;
};

export type SchemaTable = {
  name: string;
  icon: IconType;
  summary: string;
  columns: SchemaColumn[];
};

export type SchemaRelation = {
  from: string;
  to: string;
  /** e.g. "1 : N" */
  cardinality: string;
  label: string;
  /** Dashed edge for soft / optional references (e.g. citations). */
  soft?: boolean;
};

const badgeMeta: Record<
  SchemaBadge,
  { label: string; title: string; className: string }
> = {
  pk: {
    label: "PK",
    title: "Primary key",
    className: "border-amber-400/30 bg-amber-400/[0.12] text-amber-200",
  },
  fk: {
    label: "FK",
    title: "Foreign key",
    className: "border-sky-400/30 bg-sky-400/[0.10] text-sky-200",
  },
  index: {
    label: "IDX",
    title: "Indexed",
    className: "border-stone-500/40 bg-white/[0.05] text-stone-300",
  },
  vector: {
    label: "VEC",
    title: "Vector index (1536-dim)",
    className: "border-violet-400/30 bg-violet-400/[0.10] text-violet-200",
  },
  search: {
    label: "FTS",
    title: "Full-text search index",
    className: "border-emerald-400/30 bg-emerald-400/[0.10] text-emerald-200",
  },
  owner: {
    label: "OWN",
    title: "Authorization scope — filtered on every read",
    className: "border-rose-400/30 bg-rose-400/[0.10] text-rose-200",
  },
};

const legendOrder: SchemaBadge[] = [
  "pk",
  "fk",
  "index",
  "vector",
  "search",
  "owner",
];

function Badge({ badge }: { badge: SchemaBadge }) {
  const meta = badgeMeta[badge];
  return (
    <span
      className={cn(
        "inline-flex h-4 items-center rounded border px-1 font-mono text-[10px] leading-none font-medium tracking-wide",
        meta.className,
      )}
      title={meta.title}
    >
      {meta.label}
    </span>
  );
}

function TableCard({ table, index }: { table: SchemaTable; index: number }) {
  return (
    <motion.div
      className={cn(
        "overflow-hidden rounded-xl border border-white/[0.08] bg-black/40",
        "bg-[radial-gradient(120%_90%_at_50%_0%,rgba(245,158,11,0.07),transparent_62%)]",
      )}
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{
        duration: 0.45,
        delay: index * 0.05,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      <div className="flex items-center gap-2.5 border-b border-white/[0.07] bg-white/[0.02] px-4 py-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-amber-400/20 bg-amber-400/[0.08] text-amber-300">
          <HugeiconsIcon icon={table.icon} size={16} strokeWidth={1.8} />
        </span>
        <span className="font-mono text-sm font-semibold text-stone-100">
          {table.name}
        </span>
        <span className="ml-auto font-mono text-[11px] text-stone-500">
          {table.columns.length} cols
        </span>
      </div>

      <p className="border-b border-white/[0.05] px-4 py-2.5 text-xs leading-5 text-stone-400">
        {table.summary}
      </p>

      <ul className="divide-y divide-white/[0.04]">
        {table.columns.map((column) => {
          const isFk = Boolean(column.ref);
          return (
            <li
              key={column.name}
              className={cn(
                "flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2 transition-colors hover:bg-white/[0.025]",
                isFk && "border-l-2 border-l-sky-400/40",
              )}
            >
              <code className="font-mono text-xs text-stone-200">
                {column.name}
              </code>
              {column.optional ? (
                <span className="font-mono text-[10px] text-stone-600">?</span>
              ) : null}
              <code className="font-mono text-[11px] text-stone-500">
                {column.type}
              </code>
              {column.ref ? (
                <code className="font-mono text-[11px] text-sky-300/80">
                  → {column.ref}
                </code>
              ) : null}
              <span className="ml-auto flex shrink-0 items-center gap-1">
                {column.badges?.map((badge) => (
                  <Badge badge={badge} key={badge} />
                ))}
              </span>
            </li>
          );
        })}
      </ul>
    </motion.div>
  );
}

function RelationRow({ relation }: { relation: SchemaRelation }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
      <code className="font-mono text-xs text-stone-200">{relation.from}</code>
      <span
        className={cn(
          "flex items-center gap-1.5 font-mono text-[11px]",
          relation.soft ? "text-stone-500" : "text-amber-300/90",
        )}
      >
        <span className="h-px w-4 bg-current" aria-hidden />
        {relation.cardinality}
        <span
          className={cn("h-px w-4 bg-current", relation.soft && "opacity-50")}
          aria-hidden
        />
        <span aria-hidden>▸</span>
      </span>
      <code className="font-mono text-xs text-stone-200">{relation.to}</code>
      <span className="ml-auto text-xs text-stone-500">{relation.label}</span>
    </li>
  );
}

export function SchemaDiagram({
  tables,
  relations,
  caption,
}: {
  tables: SchemaTable[];
  relations: SchemaRelation[];
  caption?: string;
}) {
  return (
    <div className="mt-6">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-4 py-3">
        <span className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-stone-500 uppercase">
          <HugeiconsIcon icon={Key01Icon} size={13} strokeWidth={1.8} />
          Legend
        </span>
        {legendOrder.map((badge) => (
          <span
            className="flex items-center gap-1.5 text-xs text-stone-400"
            key={badge}
          >
            <Badge badge={badge} />
            {badgeMeta[badge].title}
          </span>
        ))}
      </div>

      {/* Entity cards */}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {tables.map((table, index) => (
          <TableCard index={index} key={table.name} table={table} />
        ))}
      </div>

      {/* Relations */}
      <div className="mt-4 overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.015]">
        <div className="border-b border-white/[0.07] bg-white/[0.02] px-4 py-2.5 text-[11px] font-medium tracking-wide text-stone-500 uppercase">
          Relationships
        </div>
        <ul className="divide-y divide-white/[0.05]">
          {relations.map((relation) => (
            <RelationRow
              key={`${relation.from}-${relation.to}-${relation.label}`}
              relation={relation}
            />
          ))}
        </ul>
      </div>

      {caption ? (
        <p className="mt-3 text-xs leading-5 text-stone-500">{caption}</p>
      ) : null}
    </div>
  );
}
