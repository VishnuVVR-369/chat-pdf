import { LandingPage } from "@/components/landing/LandingPage";
import { isAuthenticated } from "@/lib/auth-server";

export default async function Home() {
  const authenticated = await isAuthenticated();

  return <LandingPage authenticated={authenticated} />;
}
