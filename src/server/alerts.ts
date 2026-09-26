import { prisma } from "@/lib/prisma";
import { escapeHtml, sendEmail } from "@/lib/email";
import { getAppUrl } from "@/lib/env";
import { UNIT_LABELS } from "@/lib/utils";

/** Envía a los dueños un resumen de bajo inventario y lotes por caducar (7 días). */
export async function sendLowStockAlerts() {
  const businesses = await prisma.business.findMany({
    where: { lowStockEmailAlerts: true },
    include: { memberships: { where: { role: "OWNER" }, include: { user: { select: { email: true, name: true } } } } },
  });
  const soon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  let sent = 0;

  for (const business of businesses) {
    const [low, expiring] = await Promise.all([
      prisma.product.findMany({
        where: { businessId: business.id, archivedAt: null, trackStock: true, stock: { lte: prisma.product.fields.minStock } },
        orderBy: { stock: "asc" },
        take: 50,
      }),
      prisma.productBatch.findMany({
        where: { businessId: business.id, remaining: { gt: 0 }, expiresAt: { not: null, lte: soon } },
        include: { product: true },
        orderBy: { expiresAt: "asc" },
        take: 50,
      }),
    ]);
    if (low.length === 0 && expiring.length === 0) continue;

    const dateFmt = new Intl.DateTimeFormat(business.locale, { dateStyle: "medium", timeZone: business.timezone });
    const lowLines = low.map((p) => `• ${p.name}: ${p.stock} ${UNIT_LABELS[p.unit]} (mínimo ${p.minStock})`);
    const expLines = expiring.map(
      (b) => `• ${b.product.name}: ${b.remaining} ${UNIT_LABELS[b.product.unit]} caduca ${dateFmt.format(b.expiresAt!)}`
    );
    const text = [
      `Resumen de inventario de ${business.name}`,
      low.length ? `\nBajo inventario (${low.length}):\n${lowLines.join("\n")}` : "",
      expiring.length ? `\nPor caducar (${expiring.length}):\n${expLines.join("\n")}` : "",
      `\nVer sugerencias de compra: ${getAppUrl()}/inventario?tab=reabastecer`,
    ].join("\n");
    const html = `<h2>${escapeHtml(business.name)}</h2>${
      low.length ? `<h3>Bajo inventario (${low.length})</h3><ul>${lowLines.map((l) => `<li>${escapeHtml(l.slice(2))}</li>`).join("")}</ul>` : ""
    }${
      expiring.length ? `<h3>Por caducar (${expiring.length})</h3><ul>${expLines.map((l) => `<li>${escapeHtml(l.slice(2))}</li>`).join("")}</ul>` : ""
    }<p><a href="${getAppUrl()}/inventario?tab=reabastecer">Ver sugerencias de compra</a></p>`;

    for (const m of business.memberships) {
      const ok = await sendEmail({ to: m.user.email, subject: `Alertas de inventario · ${business.name}`, text, html });
      if (ok) sent++;
    }
  }
  return { businesses: businesses.length, sent };
}
