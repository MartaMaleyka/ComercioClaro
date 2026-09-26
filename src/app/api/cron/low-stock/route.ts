import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron";
import { sendLowStockAlerts } from "@/server/alerts";

/**
 * Envía por correo las alertas de bajo inventario y productos por caducar.
 * Pensado para un cron diario (p. ej. Vercel Cron) con `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const result = await sendLowStockAlerts();
  return NextResponse.json(result);
}
