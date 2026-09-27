import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron";
import { runBillingCron } from "@/server/billing";

/**
 * Cobro de la suscripción (diario): avisa antes de cobrar, renueva con la tarjeta guardada,
 * reintenta y suspende al pasar los días de gracia. `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  return NextResponse.json(await runBillingCron());
}
