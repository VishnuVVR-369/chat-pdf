import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { isAuthenticated } from "@/lib/auth-server";

export default async function SignUpPage() {
  if (await isAuthenticated()) {
    redirect("/dashboard");
  }

  return (
    <AuthPageShell
      alternateHref="/sign-in"
      alternateLabel="Already have an account?"
      badge="Get started"
      description="Create your account in one click and move directly into a cleaner PDF workflow with uploads, grounded answers, and verified citations."
      highlights={[
        {
          title: "One-click onboarding",
          description: "Google or GitHub gets you into the product immediately.",
        },
        {
          title: "Private by default",
          description: "Keep document work inside a protected authenticated space.",
        },
        {
          title: "Built for momentum",
          description: "Start asking questions instead of filling out forms.",
        },
      ]}
      kicker="Sign up"
      title={
        <>
          Start chatting with your{" "}
          <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-orange-400 bg-clip-text text-transparent">
            documents
          </span>
          .
        </>
      }
    >
      <AuthCard mode="sign-up" />
    </AuthPageShell>
  );
}
