import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DocsShell } from "@/components/docs/DocsShell";
import {
  getAdjacentDocsPages,
  getDocsPage,
  getDocsStaticParams,
} from "@/lib/docs";

export const dynamic = "force-static";
export const dynamicParams = false;

type DocsRouteProps = {
  params: Promise<{
    slug?: string[];
  }>;
};

export function generateStaticParams() {
  return getDocsStaticParams();
}

export async function generateMetadata({
  params,
}: DocsRouteProps): Promise<Metadata> {
  const { slug } = await params;
  const page = getDocsPage(slug);

  if (!page) {
    return {
      title: "Docs | ChatPDF",
    };
  }

  return {
    title: `${page.title} | ChatPDF Docs`,
    description: page.description,
  };
}

export default async function DocsPage({ params }: DocsRouteProps) {
  const { slug } = await params;
  const page = getDocsPage(slug);

  if (!page) {
    notFound();
  }

  const { previous, next } = getAdjacentDocsPages(page.slug);

  return <DocsShell next={next} page={page} previous={previous} />;
}
