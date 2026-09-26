/**
 * Cálculo de promociones (compartido por el servidor y el punto de venta).
 * Se aplica la promoción que más descuento da a cada renglón.
 */

export type PromotionType = "PERCENT" | "BUY_X_PAY_Y" | "BUNDLE_PRICE";

export interface PromotionRule {
  id: string;
  name: string;
  type: PromotionType;
  percent: number | null;
  buyQty: number | null;
  payQty: number | null;
  bundleQty: number | null;
  bundlePrice: number | null;
  productId: string | null;
  categoryId: string | null;
  startsAt: string | Date | null;
  endsAt: string | Date | null;
  active: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function isPromotionActive(p: PromotionRule, at = new Date()) {
  if (!p.active) return false;
  if (p.startsAt && new Date(p.startsAt) > at) return false;
  if (p.endsAt && new Date(p.endsAt) < at) return false;
  return true;
}

/** Descuento que da una promoción a un renglón (0 si no aplica). */
export function promotionDiscount(p: PromotionRule, quantity: number, unitPrice: number) {
  const gross = quantity * unitPrice;
  switch (p.type) {
    case "PERCENT":
      return p.percent ? round2(gross * p.percent) : 0;
    case "BUY_X_PAY_Y": {
      if (!p.buyQty || p.payQty == null || p.payQty >= p.buyQty) return 0;
      const groups = Math.floor(quantity / p.buyQty);
      return round2(groups * (p.buyQty - p.payQty) * unitPrice);
    }
    case "BUNDLE_PRICE": {
      if (!p.bundleQty || p.bundlePrice == null) return 0;
      const bundles = Math.floor(quantity / p.bundleQty);
      return Math.max(0, round2(bundles * (p.bundleQty * unitPrice - p.bundlePrice)));
    }
  }
}

export function bestPromotion(
  promotions: PromotionRule[],
  line: { productId: string; categoryId: string | null; quantity: number; unitPrice: number },
  at = new Date()
): { promotion: PromotionRule; discount: number } | null {
  let best: { promotion: PromotionRule; discount: number } | null = null;
  for (const p of promotions) {
    if (!isPromotionActive(p, at)) continue;
    const applies = p.productId ? p.productId === line.productId : p.categoryId ? p.categoryId === line.categoryId : false;
    if (!applies) continue;
    const discount = Math.min(promotionDiscount(p, line.quantity, line.unitPrice), round2(line.quantity * line.unitPrice));
    if (discount > 0 && (!best || discount > best.discount)) best = { promotion: p, discount };
  }
  return best;
}

export function describePromotion(p: PromotionRule, money: (n: number) => string) {
  switch (p.type) {
    case "PERCENT":
      return `${Math.round((p.percent ?? 0) * 1000) / 10}% de descuento`;
    case "BUY_X_PAY_Y":
      return `Lleva ${p.buyQty} paga ${p.payQty}`;
    case "BUNDLE_PRICE":
      return `${p.bundleQty} por ${money(p.bundlePrice ?? 0)}`;
  }
}
