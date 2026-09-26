import bwipjs from "bwip-js/node";
import { getAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCurrency, UNIT_LABELS } from "@/lib/utils";
import { symbologyFor } from "@/lib/barcode";
import { PrintButton } from "../ventas/[id]/ticket/PrintButton";

const SIZES = {
  small: { width: "50mm", height: "25mm", name: "text-[9px]", price: "text-sm" },
  medium: { width: "62mm", height: "35mm", name: "text-[11px]", price: "text-lg" },
  shelf: { width: "90mm", height: "40mm", name: "text-sm", price: "text-2xl" },
} as const;

/** Hoja de etiquetas de precio con código de barras (impresora térmica o hoja carta). */
export default async function LabelsPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string; copies?: string; size?: string }>;
}) {
  const auth = await getAuth();
  if (!auth) return null;
  const q = await searchParams;
  const ids = (q.ids ?? "").split(",").filter(Boolean).slice(0, 500);
  const copies = Math.min(50, Math.max(1, Number(q.copies) || 1));
  const size = SIZES[(q.size as keyof typeof SIZES) ?? "medium"] ?? SIZES.medium;
  const b = auth.business;

  const products = await prisma.product.findMany({
    where: { id: { in: ids }, businessId: b.id },
    orderBy: { name: "asc" },
  });

  const labels = products.flatMap((p) => {
    const code = p.barcode ?? p.sku;
    let svg: string | null = null;
    if (code) {
      try {
        svg = bwipjs.toSVG({
          bcid: symbologyFor(code),
          text: code,
          includetext: true,
          textxalign: "center",
          height: 8,
        });
      } catch {
        svg = null;
      }
    }
    return Array.from({ length: copies }, (_, i) => ({ key: `${p.id}-${i}`, product: p, svg }));
  });

  return (
    <>
      <style>{`@media print { @page { margin: 4mm; } }`}</style>
      <div className="no-print flex gap-2 justify-center p-3 border-b text-sm">
        <PrintButton />
        <span className="self-center text-slate-600">{labels.length} etiquetas</span>
      </div>
      <main className="flex flex-wrap gap-1 p-2">
        {labels.map(({ key, product, svg }) => (
          <div
            key={key}
            className="border border-dashed border-gray-400 p-1.5 flex flex-col justify-between overflow-hidden break-inside-avoid"
            style={{ width: size.width, height: size.height }}
          >
            <p className={`${size.name} font-semibold leading-tight line-clamp-2`}>{product.name}</p>
            <p className={`${size.price} font-bold leading-none`}>
              {formatCurrency(product.price.toNumber(), b.currency, b.locale, b.showBalboa)}
              {product.unit !== "PIECE" && (
                <span className="text-[9px] font-normal"> / {UNIT_LABELS[product.unit]}</span>
              )}
            </p>
            {svg ? (
              <div
                className="h-[40%] [&>svg]:h-full [&>svg]:w-auto [&>svg]:mx-auto"
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            ) : (
              <p className="text-[8px] text-gray-500">Sin código de barras</p>
            )}
          </div>
        ))}
      </main>
    </>
  );
}
