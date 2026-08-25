import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { DashboardShell } from "@/components/DashboardShell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session.isLoggedIn) {
    redirect("/login");
  }

  return <DashboardShell role={session.role}>{children}</DashboardShell>;
}
