"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { CheckCircle2, FileUp, HelpCircle, XCircle } from "lucide-react";
import { api } from "@/lib/client/api";
import { useFormat } from "@/lib/client/format";
import { useText } from "@/lib/client/i18n";
import type { BankLine, Match, ReconcileSale } from "@/lib/reconcile";
import { useSession } from "@/components/providers/SessionProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Select } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Stat } from "@/components/ui/Misc";

interface Result {
  matches: Match[];
  unmatchedLines: BankLine[];
  unmatchedSales: ReconcileSale[];
  totals: { deposits: number; sales: number; matchedDeposits: number; unmatchedDeposits: number; missingSales: number };
  skipped: number;
  from: string;
  to: string;
}

const MATCH_LABEL: Record<Match["type"], string> = {
  reference: "Por número de operación",
  amount: "Por monto y fecha",
  daily: "Lote del día",
};

/** Cruza el estado de cuenta del banco con las ventas cobradas por Yappy, transferencia o tarjeta. */
export function ReconciliationView() {
  const tr = useText();
  const fmt = useFormat();
  const toast = useToast();
  const { business } = useSession();
  const fileId = useId();
  const [method, setMethod] = useState(business.country === "PA" ? "YAPPY" : "TRANSFER");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    try {
      setResult(await api<Result>("/api/reconciliation", { body: { csv: await file.text(), method } }));
    } catch (err) {
      toast.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-slate-900">{tr("Conciliar con el banco")}</h2>
          <p className="text-sm text-slate-500">
            {tr(
              "Descarga el estado de cuenta en CSV desde la banca en línea y súbelo aquí. Cada depósito se cruza con tus ventas por número de operación, por monto y fecha, o como lote del día."
            )}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={run} className="grid sm:grid-cols-[1fr_200px_auto] gap-3 items-end">
            <div className="space-y-1.5">
              <label htmlFor={fileId} className="block text-sm font-medium text-slate-700">
                {tr("Estado de cuenta (CSV)")}
              </label>
              <input
                id={fileId}
                type="file"
                accept=".csv,text/csv,text/plain"
                required
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-slate-700 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700"
              />
            </div>
            <Select label={tr("Cobros por")} value={method} onChange={(e) => setMethod(e.target.value)}>
              {business.country === "PA" && <option value="YAPPY">{tr("Yappy")}</option>}
              <option value="TRANSFER">{tr("Transferencia")}</option>
              <option value="CARD">{tr("Tarjeta")}</option>
              <option value="ALL">{tr("Todos")}</option>
            </Select>
            <Button type="submit" loading={loading} disabled={!file}>
              <FileUp className="w-4 h-4" aria-hidden="true" /> {tr("Conciliar")}
            </Button>
          </form>
        </CardContent>
      </Card>

      {result && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat
              label={tr("Depósitos en el archivo")}
              value={fmt.money(result.totals.deposits)}
              hint={`${result.from} → ${result.to}`}
            />
            <Stat label={tr("Conciliados")} value={fmt.money(result.totals.matchedDeposits)} tone="positive" />
            <Stat
              label={tr("Depósitos sin venta")}
              value={fmt.money(result.totals.unmatchedDeposits)}
              tone={result.unmatchedLines.length > 0 ? "warning" : "default"}
            />
            <Stat
              label={tr("Ventas sin depósito")}
              value={fmt.money(result.totals.missingSales)}
              tone={result.unmatchedSales.length > 0 ? "negative" : "default"}
            />
          </div>

          <Card>
            <CardHeader>
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-600" aria-hidden="true" />
                {tr("Ventas sin depósito")} ({result.unmatchedSales.length})
              </h3>
              <p className="text-xs text-slate-500">
                {tr("Revisa si el cliente realmente pagó o si el banco las acreditará después.")}
              </p>
            </CardHeader>
            <CardContent className="divide-y divide-slate-100 py-0">
              {result.unmatchedSales.length === 0 ? (
                <p className="py-3 text-sm text-slate-500">{tr("Todo en orden")}</p>
              ) : (
                result.unmatchedSales.map((s) => (
                  <div key={s.id} className="py-2.5 flex justify-between gap-3 text-sm">
                    <Link href={`/ventas/${s.id}`} className="underline text-slate-900">
                      {tr("Venta #{folio}", { folio: s.folio })}
                    </Link>
                    <span className="text-slate-500">
                      {s.date}
                      {s.reference ? ` · ref. ${s.reference}` : ""}
                    </span>
                    <span className="tabular-nums font-medium">{fmt.money(s.total)}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-amber-600" aria-hidden="true" />
                {tr("Depósitos sin venta")} ({result.unmatchedLines.length})
              </h3>
              <p className="text-xs text-slate-500">
                {tr("Pagos que no encontramos en tus ventas: abonos de fiado, ventas no registradas u otros ingresos.")}
              </p>
            </CardHeader>
            <CardContent className="divide-y divide-slate-100 py-0">
              {result.unmatchedLines.length === 0 ? (
                <p className="py-3 text-sm text-slate-500">{tr("Todo en orden")}</p>
              ) : (
                result.unmatchedLines.map((l) => (
                  <div key={l.row} className="py-2.5 flex justify-between gap-3 text-sm">
                    <span className="text-slate-900 min-w-0 truncate">{l.description || l.reference || "—"}</span>
                    <span className="text-slate-500 whitespace-nowrap">{l.date}</span>
                    <span className="tabular-nums font-medium">{fmt.money(l.amount)}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-brand-600" aria-hidden="true" />
                {tr("Conciliados")} ({result.matches.length})
              </h3>
            </CardHeader>
            <CardContent className="divide-y divide-slate-100 py-0">
              {result.matches.map((m) => (
                <div key={m.line.row} className="py-2.5 text-sm flex flex-wrap justify-between gap-2">
                  <span className="text-slate-900 min-w-0">
                    {m.sales.map((s) => `#${s.folio}`).join(", ")} ·{" "}
                    <span className="text-slate-500">{m.line.description || m.line.reference}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge tone="gray">{tr(MATCH_LABEL[m.type])}</Badge>
                    <span className="tabular-nums">{fmt.money(m.line.amount)}</span>
                    {m.difference !== 0 && (
                      <span className="text-xs text-slate-500 tabular-nums">
                        ({tr("diferencia")} {fmt.money(m.difference)})
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
          {result.skipped > 0 && (
            <p className="text-xs text-slate-500">
              {tr("{n} filas del archivo no son depósitos (cargos, saldos o renglones vacíos) y se omitieron.", {
                n: result.skipped,
              })}
            </p>
          )}
        </>
      )}
    </div>
  );
}
