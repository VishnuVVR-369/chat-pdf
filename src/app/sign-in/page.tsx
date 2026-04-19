import { AuthCard } from "@/components/auth/AuthCard";
import { AuthPageShell } from "@/components/auth/AuthPageShell";

export default function SignInPage() {
  return (
    <AuthPageShell
      badge="Welcome back"
      description="Sign in with Google or GitHub and return straight to your document workspace, saved context, and citation-backed answers."
      highlights={[
        {
          title: "Resume instantly",
          description:
            "Pick up your document analysis without another setup step.",
        },
        {
          title: "Secure access",
          description: "OAuth keeps authentication simple and password-free.",
        },
        {
          title: "Same workspace",
          description:
            "Your uploads, chats, and citations are ready when you are.",
        },
      ]}
      kicker="Sign in"
      title={
        <>
          Welcome back to your{" "}
          <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-orange-400 bg-clip-text text-transparent">
            workspace
          </span>
          .
        </>
      }
    >
      <AuthCard />
    </AuthPageShell>
  );
}
