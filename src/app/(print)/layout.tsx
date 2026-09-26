import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";

export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  return <div className="bg-white text-black min-h-screen">{children}</div>;
}
