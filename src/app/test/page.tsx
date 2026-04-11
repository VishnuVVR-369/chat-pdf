import { redirect } from "next/navigation";
import { fetchAuthQuery, isAuthenticated } from "@/lib/auth-server";
import { DashboardPanelEntry } from "@/components/dashboard/DashboardPanelEntry";
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
    <DashboardPanelEntry
      email={user.email}
      name={user.name}
      tokenIdentifier={user.tokenIdentifier}
    />
  );
}
