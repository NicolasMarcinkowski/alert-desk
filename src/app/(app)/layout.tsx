import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const alertCount = await prisma.alertRule.count({
    where: { userId: session.user.id, state: "ARMED" },
  });

  return (
    <div className="flex min-h-screen">
      <Sidebar alertCount={alertCount} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header user={session.user} />
        <main className="min-w-0 flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
