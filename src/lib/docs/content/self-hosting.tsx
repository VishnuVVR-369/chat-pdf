import {
  AiMagicIcon,
  Analytics01Icon,
  Database01Icon,
  File01Icon,
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
          title: "Required services",
          body: (
            <>
              <p>
                Each service below needs an account and credentials before the
                app will work end-to-end.
              </p>
              <InfoGrid
                items={[
                  {
                    title: "Convex",
                    icon: Database01Icon,
                    description:
                      "Database, generated API bindings, server functions, file storage, and background jobs. Create a project at convex.dev.",
                  },
                  {
                    title: "Clerk",
                    icon: Shield01Icon,
                    description:
                      "Google and GitHub social sign-in, JWT issuance, and session management. Create an app at clerk.com.",
                  },
                  {
                    title: "OpenAI",
                    icon: AiMagicIcon,
                    description:
                      "Embeddings (text-embedding-3-small) and grounded answer generation. Requires an API key from platform.openai.com.",
                  },
                  {
                    title: "Mistral",
                    icon: File01Icon,
                    description:
                      "OCR 4 extracts page text from every uploaded PDF. Requires an API key from console.mistral.ai.",
                  },
                  {
                    title: "PostHog",
                    icon: Analytics01Icon,
                    description:
                      "Optional. Product analytics for page views and events. Omit the env vars to disable.",
                  },
                ]}
              />
            </>
          ),
        },
        {
          id: "clerk-setup",
          title: "Clerk JWT template",
          body: (
            <>
              <p>
                After creating a Clerk application, you must create a JWT
                template so Convex can verify Clerk sessions.
              </p>
              <BulletList
                items={[
                  "In your Clerk dashboard, go to JWT Templates and create a new template.",
                  'Name it exactly convex — Convex looks for this template by name.',
                  "Set the audience claim to your Convex deployment URL (the value of NEXT_PUBLIC_CONVEX_URL).",
                  "Copy the issuer URL from the template and set it as CLERK_JWT_ISSUER_DOMAIN.",
                ]}
              />
              <Callout type="warning" title="Template name must be convex">
                Convex's auth integration expects the JWT template to be named{" "}
                <code>convex</code> exactly. Any other name will cause
                authentication failures at the Convex backend, even if Clerk
                sign-in itself works.
              </Callout>
            </>
          ),
        },
        {
          id: "env-file",
          title: "Environment file",
          body: (
            <>
              <p>
                Copy the example file, then fill in deployment-specific values.
                Every variable is documented on the{" "}
                <a href="/docs/reference/environment-variables">
                  Environment variables
                </a>{" "}
                reference page.
              </p>
              <CodeBlock title="Create your env file">{`cp .env.example .env.local`}</CodeBlock>
            </>
          ),
        },
        {
          id: "site-urls",
          title: "Keep your URLs aligned",
          body: (
            <Callout type="warning" title="URL mismatch is the most common setup failure">
              <code>SITE_URL</code>, <code>NEXT_PUBLIC_SITE_URL</code>, the
              Convex site URL, and Clerk's allowed callback URLs must all point
              to the same origin. A mismatch is the most common reason local
              sign-in works while production sign-in fails — or OAuth redirects
              land on an error page.
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
              The repository includes a <code>vercel.json</code> configuration
              file. Set all environment variables in your Vercel project
              settings using the same values as your production{" "}
              <code>.env.local</code>, updating any localhost URLs to the
              production domain.
            </p>
          ),
        },
        {
          id: "checklist",
          title: "Deployment checklist",
          body: (
            <BulletList
              items={[
                "Production Convex deployment is running and CONVEX_DEPLOYMENT is set.",
                "NEXT_PUBLIC_CONVEX_URL points to the production deployment.",
                "Clerk application is on the Pro or Production plan with Google and GitHub OAuth enabled.",
                "Clerk JWT template named convex exists with the production Convex URL as audience.",
                "CLERK_JWT_ISSUER_DOMAIN matches the JWT template's issuer URL.",
                "Clerk callback URLs include the production domain.",
                "Clerk publishable and secret keys are the production keys, not the dev keys.",
                "OPENAI_API_KEY, OPENAI_EMBEDDING_MODEL, and OPENAI_CHAT_MODEL are set.",
                "MISTRAL_API_KEY and MISTRAL_OCR_MODEL are set.",
                "SITE_URL and NEXT_PUBLIC_SITE_URL match the production domain.",
                "PostHog values are set if analytics should run (optional).",
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
