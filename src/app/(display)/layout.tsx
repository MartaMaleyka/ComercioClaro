import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { sessionData } from "@/server/session-view";
import { SessionProvider } from "@/components/providers/SessionProvider";

/** Pantallas de apoyo a pantalla completa (sin menú): pantalla del cliente y cocina. */
export default async function DisplayLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  return <SessionProvider value={await sessionData(auth)}>{children}</SessionProvider>;
}
