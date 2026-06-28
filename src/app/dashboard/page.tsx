import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { DashboardWorkspace } from "@/components/dashboard/DashboardWorkspace";

export default async function DashboardPage() {
  const user = await currentUser();

  if (!user) {
    redirect("/sign-in");
  }

  const email =
    user.primaryEmailAddress?.emailAddress ??
    user.emailAddresses[0]?.emailAddress;
  const name = user.fullName ?? user.username ?? user.firstName;

  return <DashboardWorkspace email={email} name={name} userId={user.id} />;
}
