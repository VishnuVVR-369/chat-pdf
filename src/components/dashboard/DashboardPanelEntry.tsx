"use client";

import dynamic from "next/dynamic";

type DashboardPanelProps = {
  email: string | null | undefined;
  name: string | null | undefined;
  tokenIdentifier: string;
};

const DashboardPanel = dynamic(
  () => import("./DashboardPanel").then((mod) => mod.DashboardPanel),
  {
    ssr: false,
    loading: () => (
      <main className="relative flex h-screen items-center justify-center overflow-hidden bg-[#070707] text-stone-100">
        <div className="flex items-center gap-3 text-sm text-stone-400">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-stone-700 border-t-amber-400" />
          Loading your workspace...
        </div>
      </main>
    ),
  },
);

export function DashboardPanelEntry(props: DashboardPanelProps) {
  return <DashboardPanel {...props} />;
}
