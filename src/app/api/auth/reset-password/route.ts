import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  try {
    const { email, token, password } = await request.json();

    if (token && password) {
      const user = await prisma.user.findFirst({
        where: {
          resetToken: token,
          resetExpires: { gt: new Date() },
        },
      });

      if (!user) {
        return NextResponse.json(
          { error: "El enlace de recuperación no es válido o ha expirado" },
          { status: 400 }
        );
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: await hashPassword(password),
          resetToken: null,
          resetExpires: null,
        },
      });

      return NextResponse.json({ success: true, message: "Contraseña actualizada" });
    }

    if (!email) {
      return NextResponse.json(
        { error: "El correo es obligatorio" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({
        success: true,
        message: "Si el correo existe, recibirás instrucciones para recuperar tu contraseña",
      });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken,
        resetExpires: new Date(Date.now() + 3600000),
      },
    });

    return NextResponse.json({
      success: true,
      message: "Si el correo existe, recibirás instrucciones para recuperar tu contraseña",
      resetToken: process.env.NODE_ENV === "development" ? resetToken : undefined,
    });
  } catch {
    return NextResponse.json(
      { error: "Error al procesar la solicitud" },
      { status: 500 }
    );
  }
}
