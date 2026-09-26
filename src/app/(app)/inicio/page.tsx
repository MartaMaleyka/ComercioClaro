import { redirect } from "next/navigation";
import { getAuth, getSuperAdmin } from "@/lib/auth";

/** Página de entrada: el dueño ve el tablero y el cajero el punto de venta. */
export default async function HomeRedirect() {
  const auth = await getAuth();
  if (!auth && (await getSuperAdmin())) redirect("/admin");
  redirect(auth?.role === "OWNER" ? "/dashboard" : "/ventas");
}
