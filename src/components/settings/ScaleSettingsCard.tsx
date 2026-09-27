"use client";

import { useState } from "react";
import { Scale } from "lucide-react";
import { api } from "@/lib/client/api";
import { useText } from "@/lib/client/i18n";
import { useFormat } from "@/lib/client/format";
import { useScale } from "@/lib/client/scale";
import type { WeightBarcodeFormat } from "@/lib/scale";
import { useSession } from "@/components/providers/SessionProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Checkbox, Select } from "@/components/ui/Input";

/**
 * Balanza conectada (en este equipo, con Web Serial) y formato de las etiquetas de peso
 * que imprimen las balanzas etiquetadoras (para todo el negocio).
 */
export function ScaleSettingsCard() {
  const tr = useText();
  const fmt = useFormat();
  const toast = useToast();
  const { business } = useSession();
  const scale = useScale();
  const [reading, setReading] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState<WeightBarcodeFormat>(business.weightBarcode);
  const [saving, setSaving] = useState(false);

  async function test() {
    setBusy(true);
    try {
      const r = await scale.read();
      setReading(`${fmt.number(r.weight, 3)} ${r.unit ?? ""}`.trim());
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    try {
      await scale.connect();
      toast.success(tr("Balanza conectada"));
    } catch (err) {
      toast.error(err);
    }
  }

  async function saveLabel(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/business/weight-barcode", { method: "PUT", body: label });
      toast.success(tr("Formato de etiquetas guardado. Vuelve a abrir el punto de venta para usarlo."));
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold text-slate-900 flex items-center gap-2">
          <Scale className="w-4 h-4" aria-hidden="true" /> {tr("Balanza")}
        </h2>
      </CardHeader>
      <CardContent className="space-y-5">
        {scale.supported && (
          <section aria-labelledby="balanza-conectada" className="space-y-3">
            <h3 id="balanza-conectada" className="text-sm font-medium text-slate-700">
              {tr("Balanza conectada a esta computadora")}
            </h3>
            <p className="text-sm text-slate-600">
              {tr(
                "Conéctala por USB o con un adaptador serie. En el punto de venta aparece el botón Pesar en los productos por libra o kilo."
              )}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select
                label={tr("Velocidad (baudios)")}
                value={String(scale.config.baudRate)}
                onChange={(e) => scale.update({ ...scale.config, baudRate: Number(e.target.value) })}
              >
                {[2400, 4800, 9600, 19200].map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </Select>
              <Select
                label={tr("Protocolo")}
                value={scale.config.protocol}
                onChange={(e) =>
                  scale.update({ ...scale.config, protocol: e.target.value as "request" | "continuous" })
                }
              >
                <option value="request">{tr("Se pide el peso (Toledo, CAS y la mayoría)")}</option>
                <option value="continuous">{tr("La balanza envía el peso sola")}</option>
              </Select>
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              <Button variant="secondary" onClick={connect}>
                {scale.connected ? tr("Cambiar balanza") : tr("Conectar balanza")}
              </Button>
              {scale.connected && (
                <Button variant="secondary" onClick={test} loading={busy}>
                  {tr("Probar lectura")}
                </Button>
              )}
              {reading && (
                <p role="status" className="text-sm text-brand-700 dark:text-brand-300">
                  {tr("Peso leído: {weight}", { weight: reading })}
                </p>
              )}
            </div>
          </section>
        )}
        <form onSubmit={saveLabel} aria-labelledby="etiquetas-peso" className="space-y-3">
          <h3 id="etiquetas-peso" className="text-sm font-medium text-slate-700">
            {tr("Etiquetas de peso (balanza etiquetadora)")}
          </h3>
          <p className="text-sm text-slate-600">
            {tr(
              "Las etiquetas EAN-13 que empiezan con 20 a 29 traen el código del producto (PLU) y el peso o el precio. Al escanearlas se agrega el producto con su cantidad. El PLU es el código de barras o el SKU del producto."
            )}
          </p>
          <Checkbox
            label={tr("Reconocer etiquetas de peso al escanear")}
            checked={label.enabled}
            onChange={(e) => setLabel({ ...label, enabled: e.target.checked })}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label={tr("La etiqueta trae")}
              value={label.valueType}
              onChange={(e) => setLabel({ ...label, valueType: e.target.value as "WEIGHT" | "PRICE" })}
            >
              <option value="WEIGHT">{tr("El peso")}</option>
              <option value="PRICE">{tr("El precio")}</option>
            </Select>
            <Select
              label={tr("Dígitos del PLU")}
              value={String(label.pluDigits)}
              onChange={(e) => setLabel({ ...label, pluDigits: Number(e.target.value) as 4 | 5 | 6 })}
            >
              {[4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
            {label.valueType === "WEIGHT" && (
              <Select
                label={tr("Unidad del peso")}
                value={label.weightUnit}
                onChange={(e) =>
                  setLabel({ ...label, weightUnit: e.target.value as WeightBarcodeFormat["weightUnit"] })
                }
              >
                <option value="LB">{tr("Libras")}</option>
                <option value="KG">{tr("Kilos")}</option>
                <option value="G">{tr("Gramos")}</option>
                <option value="OZ">{tr("Onzas")}</option>
              </Select>
            )}
            <Select
              label={tr("Decimales")}
              value={String(label.decimals)}
              onChange={(e) => setLabel({ ...label, decimals: Number(e.target.value) })}
              hint={label.valueType === "PRICE" ? tr("2 = centavos") : tr("3 = milésimas")}
            >
              {[0, 1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" loading={saving}>
            {tr("Guardar")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
