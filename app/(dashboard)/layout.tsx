import { TokenGate } from "@/components/TokenGate";
import { Nav } from "@/components/Nav";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <TokenGate>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <Nav />
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </div>
    </TokenGate>
  );
}
