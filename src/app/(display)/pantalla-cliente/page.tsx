import type { Metadata } from "next";
import { CustomerDisplay } from "./CustomerDisplay";

export const metadata: Metadata = { title: "Pantalla del cliente — ComercioClaro" };

export default function CustomerDisplayPage() {
  return <CustomerDisplay />;
}
