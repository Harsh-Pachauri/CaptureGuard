import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

export default async function DevLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session.isLoggedIn) {
    redirect("/login");
  }

  return <>{children}</>;
}
