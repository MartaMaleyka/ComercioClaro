import { NextResponse } from "next/server";
import { clearSessionCookie, currentSessionId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  // Cierra también el registro de la sesión: ese token ya no sirve aunque alguien lo haya copiado.
  const sid = await currentSessionId();
  if (sid)
    await prisma.userSession.updateMany({ where: { id: sid, revokedAt: null }, data: { revokedAt: new Date() } });
  await clearSessionCookie();
  return NextResponse.json({ success: true });
}
