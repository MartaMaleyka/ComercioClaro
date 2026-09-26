"use client";

import { useRef, useState } from "react";
import useSWR from "swr";
import { ClipboardCheck, ScanBarcode, Trash2 } from "lucide-react";
import { api, fetcher } from "@/lib/client/api";
import { useFormat } from "@/lib/client/format";
import { useToast } from "@/components/providers/ToastProvider";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchBar } from "@/components/ui/SearchBar";
import { ListSkeleton } from "@/components/ui/Misc";
import { BarcodeScanner } from "@/components/pos/BarcodeScanner";

interface CountLine {
  id: string;
  counted: number;
  product: { id: string; name: string; unit: string; stock: number; barcode: string | null; cost?: number };
}
interface Count {
  id: string;
  createdAt: string;
  lines: CountLine[];
}

/** Conteo físico con escáner: cada lectura suma 1; al aplicar se ajustan las diferencias. */
export function CountTab() {
  const fmt = useFormat();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: count, mutate, isLoading } = useSWR<Count | null>("/api/inventory/counts", fetcher);
  const [code, setCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  async function start() {
    setBusy(true);
    try {
      await api("/api/inventory/counts", { body: {} });
      mutate();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  async function record(body: Record<string, unknown>) {
    if (!count) return;
    try {
      await api(`/api/inventory/counts/${count.id}/lines`, { body });
      mutate();
    } catch (err) {
      toast.error(err);
    }
  }

  async function scan(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    await record({ barcode: trimmed, quantity: 1, mode: "add" });
    setCode("");
    searchRef.current?.focus();
  }

  async function apply() {
    if (!count) return;
    const diffs = count.lines.filter((l) => l.counted !== l.product.stock).length;
    const ok = await confirm({
      title: "Aplicar conteo",
      message: `Se ajustarán ${diffs} productos para que su existencia sea igual a lo contado. Los productos no contados no cambian.`,
      confirmLabel: "Aplicar ajustes",
    });
    if (!ok) return;
    try {
      const res = await api<{ adjusted: number }>(`/api/inventory/counts/${count.id}/apply`, { body: {} });
      toast.success(`Conteo aplicado: ${res.adjusted} productos ajustados`);
      mutate();
    } catch (err) {
      toast.error(err);
    }
  }

  async function discard() {
    if (!count || !(await confirm({ title: "Descartar conteo", danger: true, confirmLabel: "Descartar" }))) return;
    await api(`/api/inventory/counts/${count.id}/cancel`, { body: {} }).catch(toast.error);
    mutate();
  }

  if (isLoading) return <ListSkeleton />;
  if (!count) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="Conteo físico"
        description="Escanea o busca cada producto del anaquel. Al terminar, las existencias se ajustan a lo contado y queda registrado el motivo."
        action={
          <Button onClick={start} loading={busy}>
            Iniciar conteo
          </Button>
        }
      />
    );
  }

  const valueDiff = count.lines.reduce((acc, l) => acc + (l.counted - l.product.stock) * (l.product.cost ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="flex-1">
          <SearchBar
            ref={searchRef}
            value={code}
            onChange={setCode}
            onEnter={() => scan(code)}
            placeholder="Escanea o escribe el código y Enter"
            autoFocus
          />
        </div>
        <Button variant="secondary" onClick={() => setScanning(true)} aria-label="Escanear con la cámara">
          <ScanBarcode className="w-5 h-5" />
        </Button>
      </div>
      <p className="text-sm text-slate-600">
        {count.lines.length} productos contados · diferencia estimada a costo:{" "}
        <span className={valueDiff < 0 ? "text-red-600 font-medium" : "text-brand-600 font-medium"}>
          {fmt.money(valueDiff)}
        </span>
      </p>
      <Card>
        <CardContent className="divide-y divide-slate-100 py-0">
          {count.lines.length === 0 && <p className="py-4 text-sm text-slate-500">Aún no hay productos contados.</p>}
          {count.lines.map((l) => {
            const diff = Math.round((l.counted - l.product.stock) * 1000) / 1000;
            return (
              <div key={l.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{l.product.name}</p>
                  <p className="text-xs text-slate-500">
                    Sistema {fmt.qty(l.product.stock, l.product.unit)} ·{" "}
                    <span className={diff === 0 ? "" : diff < 0 ? "text-red-600" : "text-amber-600"}>
                      {diff > 0 ? "+" : ""}
                      {fmt.number(diff)}
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    aria-label={`Contado de ${l.product.name}`}
                    inputMode="decimal"
                    defaultValue={l.counted}
                    onBlur={(e) =>
                      Number(e.target.value) !== l.counted &&
                      record({ productId: l.product.id, quantity: Number(e.target.value) || 0, mode: "set" })
                    }
                    className="w-20 py-1.5 px-2 bg-surface border border-slate-200 rounded-lg text-sm text-right"
                  />
                  <button
                    aria-label={`Quitar ${l.product.name}`}
                    onClick={async () => {
                      await api(`/api/inventory/counts/${count.id}/lines?productId=${l.product.id}`, {
                        method: "DELETE",
                      }).catch(toast.error);
                      mutate();
                    }}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" onClick={discard}>
          Descartar
        </Button>
        <Button onClick={apply} disabled={count.lines.length === 0}>
          Aplicar conteo
        </Button>
      </div>
      <BarcodeScanner
        open={scanning}
        onClose={() => setScanning(false)}
        onDetected={(value) => {
          setScanning(false);
          scan(value);
        }}
      />
    </div>
  );
}
