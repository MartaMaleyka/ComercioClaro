import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SecurityCenter } from "@/components/security/SecurityCenter";

export const metadata: Metadata = { title: "Seguridad · ComercioClaro" };
export const dynamic = "force-dynamic";

/**
 * Seguridad de la cuenta: verificación en dos pasos, sesiones abiertas y actividad. No depende de
 * un negocio (el super admin también la usa) y es a donde se manda a quien debe activar los dos pasos.
 */
export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ motivo?: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/seguridad");
  const { motivo } = await searchParams;
  const hasBusiness = (await prisma.membership.count({ where: { userId: user.id } })) > 0;
  return (
    <SecurityCenter
      language={user.language}
      email={user.email}
      reason={motivo === "admin" || motivo === "negocio" ? motivo : null}
      backHref={user.isSuperAdmin && !hasBusiness ? "/admin" : "/inicio"}
      continueHref={motivo === "admin" ? "/admin" : "/inicio"}
    />
  );
}
