import { redirect } from "next/navigation";
import { DashboardWorkspaceEntry } from "@/components/dashboard/DashboardWorkspaceEntry";
import { fetchAuthQuery, isAuthenticated } from "@/lib/auth-server";
import { api } from "../../../convex/_generated/api";

export default async function DashboardPage() {
  if (!(await isAuthenticated())) {
    redirect("/sign-in");
  }

  const user = await fetchAuthQuery(api.auth.getCurrentUser);

  if (!user) {
    redirect("/sign-in");
  }

  return (
    <DashboardWorkspaceEntry
      email={user.email}
      name={user.name}
      tokenIdentifier={user.tokenIdentifier}
    />
  );
}
