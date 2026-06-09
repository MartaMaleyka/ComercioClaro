import { getCurrentUser } from "@/lib/auth";
import { AppLayout } from "@/components/layout/AppLayout";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <AppLayout businessName={user.business?.name}>
      {children}
    </AppLayout>
  );
}
