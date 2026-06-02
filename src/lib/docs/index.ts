import { getStartedGroup } from "./content/get-started";
import { platformGroup } from "./content/platform";
import { referenceGroup } from "./content/reference";
import { selfHostingGroup } from "./content/self-hosting";
import { usingChatPdfGroup } from "./content/using-chatpdf";
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

export const docsSearchItems: DocsSearchItem[] = docsPages.map((page) => ({
  title: page.title,
  description: page.description,
  group: page.group,
  href: getDocsPath(page),
}));
