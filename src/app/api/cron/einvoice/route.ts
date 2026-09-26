import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron";
import { retryPendingInvoices } from "@/server/einvoice/service";

/** Reintenta las facturas electrónicas pendientes (contingencia). Programar cada 5-15 minutos. */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  return NextResponse.json(await retryPendingInvoices());
}
