import { notFound } from "next/navigation";
import bwipjs from "bwip-js/node";
import { getAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PrintButton } from "../../ventas/[id]/ticket/PrintButton";

/** Vale imprimible (ticket de 58/80 mm) con su código de barras. */
export default async function GiftCardPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuth();
  if (!auth) return null;
  const { id } = await params;
  const b = auth.business;
  const card = await prisma.giftCard.findFirst({ where: { id, businessId: b.id } });
  if (!card) notFound();
  const money = (n: number) => formatCurrency(n, b.currency, b.locale, b.showBalboa);
  const svg = bwipjs.toSVG({ bcid: "code128", text: card.code, includetext: true, textxalign: "center", height: 10 });

  return (
    <>
      <div className="no-print flex justify-center p-3 border-b">
        <PrintButton />
      </div>
      <main className="mx-auto w-[72mm] p-2 text-center text-sm space-y-2 font-mono">
        <p className="text-base font-bold">{b.name}</p>
        <p className="text-lg font-bold">VALE DE REGALO</p>
        <p className="text-2xl font-bold">{money(card.initialAmount.toNumber())}</p>
        {card.customerName && <p>Para: {card.customerName}</p>}
        <div className="mx-auto w-full" dangerouslySetInnerHTML={{ __html: svg }} />
        {card.expiresAt && <p>Válido hasta {formatDate(card.expiresAt, b.locale, b.timezone)}</p>}
        <p className="text-xs">Preséntalo al pagar. Guarda este vale: funciona como dinero.</p>
      </main>
    </>
  );
}
