import type { Metadata } from "next";
import { publicPlans } from "@/server/admin";
import { RegisterForm, type ChosenPlan } from "@/components/auth/RegisterForm";

export const metadata: Metadata = { title: "Crea tu cuenta · ComercioClaro" };
export const dynamic = "force-dynamic";

/** Registro: muestra el plan elegido en la página de precios (/registro?plan=pro). */
export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan: code } = await searchParams;
  let plan: ChosenPlan | null = null;
  if (code) {
    try {
      const found = (await publicPlans()).find((p) => p.code === code);
      if (found) {
        plan = {
          code: found.code,
          name: found.name,
          priceMonthly: Number(found.priceMonthly),
          currency: found.currency,
          trialDays: found.trialDays,
        };
      }
    } catch {
      // Sin base de datos (p. ej. al compilar) el registro se muestra sin el plan.
    }
  }
  return <RegisterForm plan={plan} />;
}
