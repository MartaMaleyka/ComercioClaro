import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";

/** Página de entrada: el dueño ve el tablero y el cajero el punto de venta. */
export default async function HomeRedirect() {
  const auth = await getAuth();
  redirect(auth?.role === "OWNER" ? "/dashboard" : "/ventas");
}
