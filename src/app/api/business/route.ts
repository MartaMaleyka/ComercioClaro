import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.business) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const data = await request.json();

  const [business, updatedUser] = await Promise.all([
    prisma.business.update({
      where: { id: user.business.id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.address !== undefined && { address: data.address }),
        ...(data.currency !== undefined && { currency: data.currency }),
      },
    }),
    data.userName
      ? prisma.user.update({
          where: { id: user.id },
          data: { name: data.userName },
        })
      : null,
  ]);

  return NextResponse.json({
    business,
    user: updatedUser
      ? { id: updatedUser.id, email: updatedUser.email, name: updatedUser.name }
      : { id: user.id, email: user.email, name: user.name },
  });
}
