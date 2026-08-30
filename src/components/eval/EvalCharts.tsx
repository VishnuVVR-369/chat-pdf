"use client";

import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/* The page is a dark surface, so charts get their own restrained palette
   rather than the Recharts defaults, which read as templated. */
const AMBER = "#f59e0b";
const AMBER_SOFT = "#fbbf24";
const INK = "rgba(255,255,255,0.10)";
const AXIS = "rgba(255,255,255,0.45)";

const axisProps = {
  stroke: "transparent",
  tick: { fill: AXIS, fontSize: 11 },
  tickLine: false,
} as const;

function TooltipShell({
  label,
  rows,
}: {
  label: string;
  rows: Array<{ key: string; value: string; color?: string }>;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#111]/95 px-3 py-2 shadow-xl backdrop-blur">
      <p className="mb-1 text-xs font-medium text-white">{label}</p>
      {rows.map((row) => (
        <p
          key={row.key}
          className="flex items-center gap-2 text-xs text-white/60"
        >
          {row.color ? (
            <span
              className="inline-block size-2 rounded-full"
              style={{ background: row.color }}
            />
          ) : null}
          <span>{row.key}</span>
          <span className="ml-auto font-mono text-white/90">{row.value}</span>
        </p>
      ))}
    </div>
  );
}

/* ── Gate pass rates, with the confidence interval drawn on the bar ── */

export type GateDatum = {
  label: string;
  value: number | null;
  low: number | null;
  high: number | null;
  passed: number;
  total: number;
};

export function GateChart({ data }: { data: GateDatum[] }) {
  const rows = data.map((gate) => ({
    ...gate,
    pct: (gate.value ?? 0) * 100,
    lowPct: (gate.low ?? 0) * 100,
    highPct: (gate.high ?? 0) * 100,
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart
        data={rows}
        layout="vertical"
        margin={{ left: 4, right: 40, top: 4, bottom: 4 }}
        barCategoryGap={12}
      >
        <XAxis type="number" domain={[0, 100]} hide />
        <YAxis
          type="category"
          dataKey="label"
          width={96}
          {...axisProps}
          tick={{ fill: "rgba(255,255,255,0.75)", fontSize: 12 }}
        />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0]!.payload as (typeof rows)[number];
            return (
              <TooltipShell
                label={row.label}
                rows={[
                  { key: "Pass rate", value: `${row.pct.toFixed(1)}%` },
                  { key: "Passed", value: `${row.passed} of ${row.total}` },
                  {
                    key: "95% CI",
                    value: `${row.lowPct.toFixed(0)}-${row.highPct.toFixed(0)}%`,
                  },
                ]}
              />
            );
          }}
        />
        <Bar
          dataKey="pct"
          radius={[0, 6, 6, 0]}
          background={{ fill: INK }}
          isAnimationActive={false}
        >
          {rows.map((row) => (
            <Cell
              key={row.label}
              fill={
                row.label === "End to end" ? AMBER : "rgba(255,255,255,0.5)"
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ── Failure taxonomy ─────────────────────────────────────────────── */

const FAILURE_COLORS: Record<string, string> = {
  content_failure: "#38bdf8",
  citation_failure: "#2dd4bf",
  abstention_failure: "#fb923c",
  retrieval_miss: "#f87171",
  page_scope_violation: "#c084fc",
  grounding_failure: "#facc15",
  system_error: "#94a3b8",
};

export function FailureDonut({
  data,
  passed,
}: {
  data: Array<{ key: string; label: string; count: number }>;
  passed: number;
}) {
  const slices = [
    { key: "passed", label: "Passed all gates", count: passed },
    ...data,
  ];
  const total = slices.reduce((sum, slice) => sum + slice.count, 0);

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={slices}
          dataKey="count"
          nameKey="label"
          innerRadius="62%"
          outerRadius="88%"
          paddingAngle={2}
          stroke="none"
          isAnimationActive={false}
        >
          {slices.map((slice) => (
            <Cell
              key={slice.key}
              fill={
                slice.key === "passed"
                  ? AMBER
                  : (FAILURE_COLORS[slice.key] ?? "#64748b")
              }
            />
          ))}
        </Pie>
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const slice = payload[0]!.payload as (typeof slices)[number];
            return (
              <TooltipShell
                label={slice.label}
                rows={[
                  { key: "Cases", value: String(slice.count) },
                  {
                    key: "Share",
                    value: `${((slice.count / total) * 100).toFixed(0)}%`,
                  },
                ]}
              />
            );
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

/* ── Judge dimension radar ────────────────────────────────────────── */

export function DimensionRadar({
  data,
}: {
  data: Array<{ label: string; value: number | null; lowerIsBetter: boolean }>;
}) {
  // Only same-polarity dimensions go on the radar. Mixing in an inverted
  // metric would dent the shape for a reason the eye cannot read, so context
  // noise is reported separately instead of being flipped to fit.
  const rows = data
    .filter((dimension) => !dimension.lowerIsBetter)
    .map((dimension) => ({
      label: dimension.label,
      score: dimension.value ?? 0,
      raw: dimension.value ?? 0,
    }));

  return (
    <ResponsiveContainer width="100%" height={430}>
      <RadarChart data={rows} outerRadius="78%">
        <PolarGrid stroke={INK} />
        <PolarAngleAxis dataKey="label" tick={{ fill: AXIS, fontSize: 10.5 }} />
        <PolarRadiusAxis domain={[0, 4]} tick={false} axisLine={false} />
        <Radar
          dataKey="score"
          stroke={AMBER}
          fill={AMBER}
          fillOpacity={0.22}
          strokeWidth={2}
          isAnimationActive={false}
        />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0]!.payload as (typeof rows)[number];
            return (
              <TooltipShell
                label={row.label}
                rows={[{ key: "Score", value: `${row.raw.toFixed(2)} / 4` }]}
              />
            );
          }}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

/* ── Cost by pipeline stage ───────────────────────────────────────── */

export function StageCostChart({
  data,
}: {
  data: Array<{ label: string; costUsd: number | null; calls: number }>;
}) {
  const rows = data
    .filter((stage) => stage.costUsd !== null && stage.costUsd > 0)
    .map((stage) => ({ ...stage, cost: stage.costUsd ?? 0 }));

  return (
    <ResponsiveContainer width="100%" height={230}>
      <BarChart
        data={rows}
        margin={{ left: -18, right: 8, top: 8, bottom: 4 }}
        barCategoryGap={18}
      >
        <XAxis
          dataKey="label"
          {...axisProps}
          interval={0}
          tick={{ fill: AXIS, fontSize: 10 }}
          tickFormatter={(value: string) => value.replace("Judge: ", "Judge ")}
        />
        <YAxis
          {...axisProps}
          tickFormatter={(value: number) => `$${value.toFixed(2)}`}
        />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0]!.payload as (typeof rows)[number];
            return (
              <TooltipShell
                label={row.label}
                rows={[
                  { key: "Cost", value: `$${row.cost.toFixed(4)}` },
                  { key: "API calls", value: String(row.calls) },
                ]}
              />
            );
          }}
        />
        <Bar dataKey="cost" radius={[6, 6, 0, 0]} isAnimationActive={false}>
          {rows.map((row, index) => (
            <Cell
              key={row.label}
              fill={index === 0 ? AMBER : "rgba(255,255,255,0.34)"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ── Pass rate by document ────────────────────────────────────────── */

export function DocumentChart({
  data,
  labels,
}: {
  data: Array<{ name: string; count: number; endToEnd: number | null }>;
  /** Maps a document key to the short display name shown on the axis. */
  labels: Record<string, string>;
}) {
  const rows = data.map((row) => ({
    ...row,
    pct: (row.endToEnd ?? 0) * 100,
    short: labels[row.name] ?? row.name,
  }));

  return (
    <ResponsiveContainer width="100%" height={230}>
      <BarChart
        data={rows}
        layout="vertical"
        margin={{ left: 4, right: 16, top: 4, bottom: 4 }}
        barCategoryGap={10}
      >
        <XAxis type="number" domain={[0, 100]} hide />
        <YAxis
          type="category"
          dataKey="short"
          width={150}
          {...axisProps}
          tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 10.5 }}
        />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0]!.payload as (typeof rows)[number];
            return (
              <TooltipShell
                label={row.short}
                rows={[
                  { key: "End to end", value: `${row.pct.toFixed(1)}%` },
                  { key: "Questions", value: String(row.count) },
                ]}
              />
            );
          }}
        />
        <Bar
          dataKey="pct"
          radius={[0, 6, 6, 0]}
          background={{ fill: INK }}
          isAnimationActive={false}
        >
          {rows.map((row) => (
            <Cell
              key={row.name}
              fill={AMBER_SOFT}
              fillOpacity={0.45 + (row.pct / 100) * 0.55}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
