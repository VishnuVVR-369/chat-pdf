import { getStartedGroup } from "./content/get-started";
import { platformGroup } from "./content/platform";
import { referenceGroup } from "./content/reference";
import { selfHostingGroup } from "./content/self-hosting";
import { usingChatPdfGroup } from "./content/using-chatpdf";
import { isValidElement, type ReactNode } from "react";
import type { DocsGroup, DocsPage, DocsSearchItem } from "./types";

export type {
  DocsGroup,
  DocsHighlight,
  DocsPage,
  DocsQuickFact,
  DocsSearchItem,
  DocsSection,
} from "./types";

export const docsGroups: DocsGroup[] = [
  getStartedGroup,
  usingChatPdfGroup,
  platformGroup,
  selfHostingGroup,
  referenceGroup,
];

export const docsPages = docsGroups.flatMap((group) => group.pages);

export const firstDocsPage = docsPages[0];

export function getDocsPath(page: Pick<DocsPage, "slug">) {
  return page.slug === "overview" ? "/docs" : `/docs/${page.slug}`;
}

export function getDocsPage(slug?: string[]) {
  const normalizedSlug = slug?.length ? slug.join("/") : "overview";
  return docsPages.find((page) => page.slug === normalizedSlug);
}

export function getAdjacentDocsPages(currentSlug: string) {
  const currentIndex = docsPages.findIndex((page) => page.slug === currentSlug);

  return {
    previous: currentIndex > 0 ? docsPages[currentIndex - 1] : undefined,
    next:
      currentIndex >= 0 && currentIndex < docsPages.length - 1
        ? docsPages[currentIndex + 1]
        : undefined,
  };
}

export function getDocsStaticParams() {
  return docsPages.map((page) => ({
    slug: page.slug === "overview" ? [] : page.slug.split("/"),
  }));
}

const searchablePropNames = new Set([
  "answer",
  "caption",
  "chart",
  "children",
  "content",
  "description",
  "display",
  "items",
  "label",
  "language",
  "name",
  "purpose",
  "question",
  "rows",
  "title",
  "type",
  "value",
]);

function appendSearchText(parts: string[], value: unknown) {
  if (value === null || value === undefined || typeof value === "boolean") {
    return;
  }

  if (typeof value === "string" || typeof value === "number") {
    parts.push(String(value));
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      appendSearchText(parts, item);
    }
    return;
  }

  if (isValidElement<Record<string, unknown>>(value)) {
    for (const [propName, propValue] of Object.entries(value.props)) {
      if (searchablePropNames.has(propName)) {
        appendSearchText(parts, propValue);
      }
    }
    return;
  }

  if (typeof value === "object") {
    for (const [propName, propValue] of Object.entries(value)) {
      if (searchablePropNames.has(propName)) {
        appendSearchText(parts, propValue);
      }
    }
  }
}

function toSearchText(value: ReactNode) {
  const parts: string[] = [];
  appendSearchText(parts, value);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function getPageSearchText(page: DocsPage) {
  return [
    page.title,
    page.description,
    page.group,
    page.eyebrow,
    ...(page.quickFacts ?? []).flatMap((fact) => [fact.label, fact.value]),
    ...(page.highlights ?? []).flatMap((highlight) => [
      highlight.title,
      highlight.description,
    ]),
    ...page.sections.flatMap((section) => [
      section.title,
      toSearchText(section.body),
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export const docsSearchItems: DocsSearchItem[] = docsPages.map((page) => ({
  title: page.title,
  description: page.description,
  group: page.group,
  href: getDocsPath(page),
  searchText: getPageSearchText(page),
}));
