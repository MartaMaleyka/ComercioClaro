import type { Role } from "@/generated/prisma/enums";

/** Oculta costos a los cajeros. */
export function publicProduct<T extends { cost: unknown }>(product: T, role: Role) {
  if (role === "OWNER") return product;
  const { cost: _cost, ...rest } = product;
  void _cost;
  return rest;
}

export function publicSale<T extends { costTotal: unknown; items: { unitCost: unknown }[] }>(sale: T, role: Role) {
  if (role === "OWNER") return sale;
  const { costTotal: _c, items, ...rest } = sale;
  void _c;
  return {
    ...rest,
    items: items.map((i) => {
      const { unitCost: _u, ...item } = i;
      void _u;
      return item;
    }),
  };
}
