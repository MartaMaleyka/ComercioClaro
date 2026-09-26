"use client";

import { useText } from "@/lib/client/i18n";
import { usePaginated } from "@/lib/client/hooks";
import { useFormat } from "@/lib/client/format";
import type { Product } from "@/lib/client/types";
import { ADJUSTMENT_REASON_LABELS, MOVEMENT_TYPE_LABELS } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { ListSkeleton, LoadMore } from "@/components/ui/Misc";

interface Movement {
  id: string;
  type: string;
  quantity: number;
  stockAfter: number;
  unitCost: number | null;
  reason: string | null;
  notes: string | null;
  createdAt: string;
}

export function MovementsModal({ product, onClose }: { product: Product | null; onClose: () => void }) {
  return product ? <Movements product={product} onClose={onClose} /> : null;
}

function Movements({ product, onClose }: { product: Product; onClose: () => void }) {
  const tr = useText();
  const fmt = useFormat();
  const list = usePaginated<Movement>(`/api/products/${product.id}/movements`);

  return (
    <Modal open onClose={onClose} title={`Movimientos: ${product.name}`}>
      {list.isLoading ? (
        <ListSkeleton rows={3} />
      ) : list.items.length === 0 ? (
        <p className="text-sm text-slate-500">{tr("Sin movimientos registrados.")}</p>
      ) : (
        <div className="space-y-1">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[420px]">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="py-1 font-medium">{tr("Fecha")}</th>
                  <th className="py-1 font-medium">{tr("Movimiento")}</th>
                  <th className="py-1 font-medium text-right">{tr("Cant.")}</th>
                  <th className="py-1 font-medium text-right">{tr("Queda")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.items.map((m) => (
                  <tr key={m.id}>
                    <td className="py-2 text-xs text-slate-500">{fmt.dateTime(m.createdAt)}</td>
                    <td className="py-2">
                      {tr(MOVEMENT_TYPE_LABELS[m.type] ?? m.type)}
                      {m.reason && (
                        <span className="text-xs text-slate-500"> · {tr(ADJUSTMENT_REASON_LABELS[m.reason])}</span>
                      )}
                      {m.notes && <span className="block text-xs text-slate-500">{m.notes}</span>}
                    </td>
                    <td
                      className={`py-2 text-right tabular-nums ${m.quantity < 0 ? "text-red-600" : "text-brand-600"}`}
                    >
                      {m.quantity > 0 ? "+" : ""}
                      {fmt.number(m.quantity)}
                    </td>
                    <td className="py-2 text-right tabular-nums">{fmt.number(m.stockAfter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <LoadMore hasMore={list.hasMore} loading={list.loadingMore} onClick={list.loadMore} />
        </div>
      )}
    </Modal>
  );
}
