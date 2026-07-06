import type { ReactNode } from "react";

export type DocsSection = {
  id: string;
  title: string;
  body: ReactNode;
};

export type DocsQuickFact = {
  label: string;
  value: string;
};

export type DocsHighlight = {
  title: string;
  description: string;
  href?: string;
};

export type DocsPage = {
  slug: string;
  group: string;
  title: string;
  description: string;
  eyebrow: string;
  sections: DocsSection[];
  quickFacts?: DocsQuickFact[];
  highlights?: DocsHighlight[];
};

export type DocsGroup = {
  title: string;
  pages: DocsPage[];
};

export type DocsSearchItem = {
  title: string;
  description: string;
  group: string;
  href: string;
  searchText: string;
};
