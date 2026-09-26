import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { toPromotionRule } from "@/server/sales";
import { deliveryZones } from "@/server/delivery";
import { catalogAccessSelect, catalogAvailable } from "@/server/online-orders";
import { describePromotion, isPromotionActive } from "@/lib/promotions";
import { formatCurrency } from "@/lib/utils";
import { CatalogClient, type CatalogProduct } from "./CatalogClient";

async function load(slug: string) {
  const business = await prisma.business.findFirst({
    where: { catalogSlug: slug, catalogEnabled: true },
    select: {
      id: true,
      name: true,
      description: true,
      address: true,
      phone: true,
      currency: true,
      locale: true,
      showBalboa: true,
      catalogWhatsapp: true,
      deliveryZones: true,
      ...catalogAccessSelect,
    },
  });
  return business && catalogAvailable(business) ? business : null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const business = await load((await params).slug);
  return business
    ? {
        title: `${business.name} · Catálogo`,
        description: business.description ?? `Productos y precios de ${business.name}`,
      }
    : { title: "Catálogo" };
}

/** Catálogo público: solo nombre, precio, categoría y disponibilidad (sin costos ni existencias). */
export default async function CatalogPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const business = await load(slug);
  if (!business) notFound();

  const zones = deliveryZones(business);
  const [products, promotions] = await Promise.all([
    prisma.product.findMany({
      where: { businessId: business.id, archivedAt: null, id: { notIn: zones.map((z) => z.productId) } },
      select: {
        id: true,
        name: true,
        price: true,
        unit: true,
        stock: true,
        trackStock: true,
        categoryId: true,
        category: { select: { name: true } },
      },
      orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
      take: 2000,
    }),
    prisma.promotion.findMany({ where: { businessId: business.id, active: true } }),
  ]);
  const money = (n: number) => formatCurrency(n, business.currency, business.locale, business.showBalboa);
  const rules = promotions.map(toPromotionRule).filter((p) => isPromotionActive(p));

  const items: CatalogProduct[] = products.map((p) => {
    const promo = rules.find((r) => r.productId === p.id || (r.categoryId && r.categoryId === p.categoryId));
    return {
      id: p.id,
      name: p.name,
      price: p.price.toNumber(),
      unit: p.unit,
      category: p.category?.name ?? "Otros",
      available: !p.trackStock || p.stock.gt(0),
      promotion: promo ? `${promo.name} · ${describePromotion(promo, money)}` : null,
    };
  });

  return (
    <CatalogClient
      slug={slug}
      business={{
        name: business.name,
        description: business.description,
        address: business.address,
        whatsapp: business.catalogWhatsapp ?? business.phone,
        currency: business.currency,
        locale: business.locale,
        showBalboa: business.showBalboa,
      }}
      zones={zones.map((z) => ({ name: z.name, fee: z.fee }))}
      products={items}
    />
  );
}
