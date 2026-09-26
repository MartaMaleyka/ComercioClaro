import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { handleYappyIpn } from "@/server/yappy";

/** Notificación de pago (IPN) que Yappy envía al confirmar, rechazar o expirar un cobro. */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  try {
    await handleYappyIpn({
      orderId: q.get("orderId") ?? "",
      status: q.get("status") ?? "",
      domain: q.get("domain") ?? "",
      hash: q.get("hash") ?? "",
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err);
  }
}
