import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { sendLowStockAlerts } from "@/server/alerts";

/**
 * Envía por correo las alertas de bajo inventario y productos por caducar.
 * Pensado para un cron diario (p. ej. Vercel Cron) con `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (
    !secret ||
    header.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected))
  ) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const result = await sendLowStockAlerts();
  return NextResponse.json(result);
}
