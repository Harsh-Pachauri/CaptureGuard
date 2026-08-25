import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { JudgeAccessForm } from "@/components/JudgeAccessForm";

export default async function JudgePage() {
  const session = await getSession();
  if (session.isLoggedIn) {
    redirect(session.role === "judge" ? "/test-lab" : "/overview");
  }

  return <JudgeAccessForm />;
}
