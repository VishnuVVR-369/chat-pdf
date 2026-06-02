import {
  AiMagicIcon,
  Analytics01Icon,
  Database01Icon,
  File01Icon,
  Layers01Icon,
  Shield01Icon,
} from "@hugeicons/core-free-icons";

import {
  BulletList,
  Callout,
  CodeBlock,
  InfoGrid,
} from "@/components/docs/mdx";
import type { DocsGroup } from "../types";

export const selfHostingGroup: DocsGroup = {
  title: "Self-hosting",
  pages: [
    {
      slug: "self-hosting/configuration",
      group: "Self-hosting",
      eyebrow: "Setup",
      title: "Configuration",
      description:
        "Configure the external services needed to run ChatPDF in your own environment.",
      sections: [
        {
          id: "services",
          title: "Services",
          body: (
            <InfoGrid
              items={[
                {
                  title: "Convex",
                  icon: Database01Icon,
                  description:
                    "Database, generated API bindings, server functions, and background jobs.",
                },
                {
                  title: "Better Auth",
                  icon: Shield01Icon,
                  description:
                    "Google and GitHub sessions for dashboard access.",
                },
                {
                  title: "OpenAI",
                  icon: AiMagicIcon,
                  description: "Embeddings and grounded answer text.",
                },
                {
                  title: "Google Document AI",
                  icon: File01Icon,
                  description: "Batch OCR for every uploaded PDF.",
                },
                {
                  title: "PostHog",
                  icon: Analytics01Icon,
                  description: "Optional analytics for product events.",
                },
                {
                  title: "Upstash Redis",
                  icon: Layers01Icon,
                  description:
                    "Optional Redis REST credentials for rate limiting and queue-adjacent features.",
                },
              ]}
            />
          ),
        },
        {
          id: "env-file",
          title: "Environment file",
          body: (
            <>
              <p>
                Copy the example file, then fill in deployment-specific values.
              </p>
              <CodeBlock title="Create your env file">{`cp .env.example .env.local`}</CodeBlock>
            </>
          ),
        },
        {
          id: "site-urls",
          title: "Site URLs",
          body: (
            <Callout type="warning" title="Keep your URLs aligned">
              Keep <code>SITE_URL</code>, <code>NEXT_PUBLIC_SITE_URL</code>,
              OAuth callback URLs, and the Convex site URL consistent. Mismatched
              URLs are the most common reason local sign-in works while
              production sign-in fails.
            </Callout>
          ),
        },
      ],
    },
    {
      slug: "self-hosting/local-development",
      group: "Self-hosting",
      eyebrow: "Developer workflow",
      title: "Local development",
      description:
        "Run the frontend and backend locally and use the validation commands the repo expects.",
      sections: [
        {
          id: "commands",
          title: "Commands",
          body: (
            <CodeBlock title="Develop & validate">{`pnpm dev
npx convex dev
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build`}</CodeBlock>
          ),
        },
        {
          id: "when-to-run-convex",
          title: "When to run Convex",
          body: (
            <p>
              Run <code>npx convex dev</code> when working on document
              processing, chat, uploads, auth-backed data, generated Convex API
              bindings, or any UI that subscribes to backend state.
            </p>
          ),
        },
        {
          id: "generated-files",
          title: "Generated files",
          body: (
            <Callout type="note">
              Convex generated files live under <code>convex/_generated</code>{" "}
              and are ignored by lint configuration. If schema or function
              signatures change, refresh the generated bindings before trusting
              TypeScript errors.
            </Callout>
          ),
        },
      ],
    },
    {
      slug: "self-hosting/deployment",
      group: "Self-hosting",
      eyebrow: "Production",
      title: "Deployment",
      description:
        "Prepare the app for Vercel or another Next.js hosting environment.",
      sections: [
        {
          id: "vercel",
          title: "Vercel",
          body: (
            <p>
              The repository includes a Vercel configuration file. Set the same
              environment variables in Vercel that you use locally, then deploy
              the Next.js app and the Convex backend with matching production
              URLs.
            </p>
          ),
        },
        {
          id: "checklist",
          title: "Deployment checklist",
          body: (
            <BulletList
              items={[
                "Production Convex deployment is configured.",
                "OAuth callback URLs point to the production domain.",
                "Better Auth secret is set and not reused from examples.",
                "OpenAI and Google Document AI credentials are present.",
                "Google Cloud Storage bucket and prefixes exist.",
                "PostHog values are present if analytics should run.",
              ]}
            />
          ),
        },
        {
          id: "build",
          title: "Build before deploy",
          body: <CodeBlock title="Production build">{`pnpm build`}</CodeBlock>,
        },
      ],
    },
  ],
};
