import type { Metadata } from "next";
import { KitchenDisplay } from "./KitchenDisplay";

export const metadata: Metadata = { title: "Cocina — ComercioClaro" };

export default function KitchenPage() {
  return <KitchenDisplay />;
}
