"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";

import { cn } from "@/lib/utils";

type MermaidApi = (typeof import("mermaid"))["default"];

/**
 * Dark + amber theme for Mermaid so diagrams read as part of the ChatPDF docs
 * instead of the default Mermaid look. Tuned against the #070707 / amber-400
 * surface used across the docs route.
 */
const themeVariables = {
  darkMode: true,
  background: "transparent",
  fontSize: "13px",
  // Flowchart nodes
  primaryColor: "#17120b",
  primaryBorderColor: "#f59e0b",
  primaryTextColor: "#f5f5f4",
  secondaryColor: "#14110d",
  secondaryBorderColor: "#57534e",
  secondaryTextColor: "#e7e5e4",
  tertiaryColor: "#0c0a09",
  tertiaryBorderColor: "#292524",
  tertiaryTextColor: "#d6d3d1",
  mainBkg: "#17120b",
  nodeBorder: "#f59e0b",
  nodeTextColor: "#f5f5f4",
  lineColor: "#cf9f54",
  textColor: "#d6d3d1",
  edgeLabelBackground: "#0d0c0b",
  // Subgraph clusters
  clusterBkg: "rgba(245, 158, 11, 0.04)",
  clusterBorder: "#3f3a2e",
  titleColor: "#fbbf24",
  // Sequence diagrams
  actorBkg: "#17120b",
  actorBorder: "#f59e0b",
  actorTextColor: "#f5f5f4",
  actorLineColor: "#57534e",
  signalColor: "#cf9f54",
  signalTextColor: "#d6d3d1",
  labelBoxBkgColor: "#1c1917",
  labelBoxBorderColor: "#44403c",
  labelTextColor: "#f5f5f4",
  loopTextColor: "#d6d3d1",
  noteBkgColor: "#241b0d",
  noteBorderColor: "#a16207",
  noteTextColor: "#fde68a",
  activationBkgColor: "#292524",
  activationBorderColor: "#f59e0b",
  sequenceNumberColor: "#070707",
};

let mermaidLoader: Promise<MermaidApi> | null = null;
let diagramCounter = 0;

function loadMermaid() {
  if (!mermaidLoader) {
    mermaidLoader = import("mermaid").then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "base",
        fontFamily:
          "var(--font-sans), ui-sans-serif, system-ui, -apple-system, sans-serif",
        themeVariables,
        flowchart: {
          curve: "basis",
          padding: 14,
          nodeSpacing: 44,
          rankSpacing: 52,
          useMaxWidth: true,
        },
        sequence: {
          useMaxWidth: true,
          mirrorActors: false,
          actorMargin: 44,
          boxMargin: 8,
          noteMargin: 8,
          messageMargin: 28,
        },
      });
      return mermaid;
    });
  }

  return mermaidLoader;
}

type DiagramProps = {
  chart: string;
  caption?: string;
  className?: string;
};

export function Diagram({ chart, caption, className }: DiagramProps) {
  const [svg, setSvg] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const renderId = `docs-diagram-${(diagramCounter += 1)}`;

    loadMermaid()
      .then((mermaid) => mermaid.render(renderId, chart))
      .then(({ svg: rendered }) => {
        if (active) {
          setSvg(rendered);
          setHasError(false);
        }
      })
      .catch(() => {
        if (active) {
          setHasError(true);
        }
      });

    return () => {
      active = false;
    };
  }, [chart]);

  return (
    <motion.figure
      className={cn(
        "group/diagram mt-6 overflow-hidden rounded-xl border border-white/[0.08] bg-black/40",
        "bg-[radial-gradient(120%_120%_at_50%_0%,rgba(245,158,11,0.06),transparent_60%)]",
        className,
      )}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5"
        aria-hidden
      >
        <span className="h-2 w-2 rounded-full bg-amber-400/80" />
        <span className="text-xs font-medium tracking-wide text-stone-500 uppercase">
          Diagram
        </span>
      </div>

      <div className="overflow-x-auto px-4 py-6 sm:px-6">
        {hasError ? (
          <pre className="overflow-x-auto rounded-lg border border-red-500/20 bg-red-500/[0.04] p-4 font-mono text-xs leading-6 text-red-200/90">
            <code>{chart}</code>
          </pre>
        ) : svg ? (
          <div
            ref={containerRef}
            className="mx-auto flex justify-center [&_svg]:h-auto [&_svg]:max-w-full"
            // Mermaid output is generated from static, author-controlled chart
            // definitions and sanitized by Mermaid (securityLevel: "strict").
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <div className="flex h-40 items-center justify-center">
            <div className="flex items-center gap-2 text-xs text-stone-600">
              <span className="h-3 w-3 animate-spin rounded-full border border-stone-700 border-t-amber-400" />
              Rendering diagram…
            </div>
          </div>
        )}
      </div>

      {caption ? (
        <figcaption className="border-t border-white/[0.06] px-4 py-2.5 text-xs leading-5 text-stone-500 sm:px-6">
          {caption}
        </figcaption>
      ) : null}
    </motion.figure>
  );
}
