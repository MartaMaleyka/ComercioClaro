import { handler, parseQuery } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/auth";
import { csvResponse, toCsv } from "@/lib/csv";
import { businessTypeLabel } from "@/lib/business-types";
import { adminListSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import { adminAudit, adminListBusinesses } from "@/server/admin";

const STATUS: Record<string, string> = {
  ACTIVE: "Activo",
  TRIAL: "En prueba",
  SUSPENDED: "Suspendido",
  PENDING: "Por aprobar",
  CLOSED: "Dado de baja",
};

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

/** Lista de negocios con los mismos filtros de la pantalla, en CSV para Excel. */
export const GET = handler(async (request) => {
  const admin = await requireSuperAdmin();
  const query = parseQuery(request, adminListSchema);
  const rows = await adminListBusinesses(query);
  await adminAudit(prisma, admin, "business.export", "Business", null, { count: rows.length, filters: { ...query } });
  const csv = toCsv(
    [
      "Negocio",
      "Tipo",
      "País",
      "Dueño",
      "Correo",
      "Correo confirmado",
      "Plan",
      "Estado",
      "Origen",
      "Registrado",
      "Último acceso",
      "Última venta",
      "Prueba hasta",
      "Pagado hasta",
      "Usuarios",
      "Productos",
      "Ventas",
      "Motivo de baja",
    ],
    rows.map((b) => [
      b.name,
      businessTypeLabel(b.businessType) ?? "",
      b.country,
      b.owners[0]?.name ?? "",
      b.owners[0]?.email ?? "",
      b.owners[0] ? (b.owners[0].emailVerified ? "Sí" : "No") : "",
      b.plan?.name ?? "Sin plan",
      b.access.blocked && b.access.reason === "trialEnded" ? "Prueba vencida" : (STATUS[b.status] ?? b.status),
      b.signupSource === "SELF" ? "Registro propio" : b.signupSource === "ADMIN" ? "Alta del admin" : "",
      day(b.createdAt),
      day(b.lastLoginAt),
      day(b.lastSaleAt),
      day(b.trialEndsAt),
      day(b.paidUntil),
      b.counts.memberships,
      b.counts.products,
      b.counts.sales,
      b.closedReason ?? "",
    ])
  );
  return csvResponse(`negocios-${new Date().toISOString().slice(0, 10)}.csv`, csv);
});
