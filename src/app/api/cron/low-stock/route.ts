import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron";
import { sendLowStockAlerts } from "@/server/alerts";
import { generateRecurringExpenses } from "@/server/cashflow";

/**
 * Tareas diarias: registra los gastos recurrentes del mes que ya tocan y envía por correo
 * las alertas de bajo inventario, productos por caducar y facturas de proveedores.
 * Pensado para un cron diario (p. ej. Vercel Cron) con `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const recurring = await generateRecurringExpenses();
  const result = await sendLowStockAlerts();
  return NextResponse.json({ ...result, recurring });
}
