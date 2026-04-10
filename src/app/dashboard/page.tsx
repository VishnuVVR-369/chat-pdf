import { redirect } from "next/navigation";
import { fetchAuthQuery, isAuthenticated } from "@/lib/auth-server";
import { DashboardPanel } from "@/components/dashboard/DashboardPanel";
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
    <DashboardPanel
      email={user.email}
      name={user.name}
      tokenIdentifier={user.tokenIdentifier}
    />
  );
}
