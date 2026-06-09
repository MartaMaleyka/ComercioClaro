"use client";

import { useEffect, useState } from "react";
import { Settings, User, Store } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

interface UserData {
  user: { id: string; email: string; name: string };
  business: {
    id: string;
    name: string;
    description: string | null;
    phone: string | null;
    address: string | null;
    currency: string;
  } | null;
}

export default function ConfiguracionPage() {
  const [data, setData] = useState<UserData | null>(null);
  const [form, setForm] = useState({
    userName: "",
    businessName: "",
    description: "",
    phone: "",
    address: "",
    currency: "MXN",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d: UserData) => {
        setData(d);
        setForm({
          userName: d.user.name,
          businessName: d.business?.name || "",
          description: d.business?.description || "",
          phone: d.business?.phone || "",
          address: d.business?.address || "",
          currency: d.business?.currency || "MXN",
        });
      })
      .finally(() => setLoading(false));
  }, []);

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/business", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setMessage("Cambios guardados correctamente");
        const updated = await res.json();
        setData((prev) =>
          prev
            ? {
                user: updated.user,
                business: updated.business,
              }
            : null
        );
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-slate-200 rounded-lg w-48 animate-pulse" />
        <div className="h-64 bg-slate-200 rounded-2xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Configuración</h1>
        <p className="text-sm text-slate-600">
          Administra tu perfil y la información de tu negocio
        </p>
      </div>

      {message && (
        <div className="p-3 bg-brand-50 text-brand-700 text-sm rounded-xl">
          {message}
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-slate-500" />
            <h2 className="font-semibold text-slate-900">Tu perfil</h2>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            label="Tu nombre"
            value={form.userName}
            onChange={(e) => update("userName", e.target.value)}
          />
          <Input
            label="Correo electrónico"
            value={data?.user.email || ""}
            disabled
            className="opacity-60"
          />
          <p className="text-xs text-slate-400">
            El correo no se puede cambiar por ahora
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Store className="w-5 h-5 text-slate-500" />
            <h2 className="font-semibold text-slate-900">Tu negocio</h2>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            label="Nombre del negocio"
            value={form.businessName}
            onChange={(e) => update("businessName", e.target.value)}
          />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Descripción
            </label>
            <textarea
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
              rows={3}
              placeholder="Breve descripción de tu negocio"
            />
          </div>
          <Input
            label="Teléfono"
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            placeholder="Ej: 55 1234 5678"
          />
          <Input
            label="Dirección"
            value={form.address}
            onChange={(e) => update("address", e.target.value)}
            placeholder="Calle, colonia, ciudad"
          />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Moneda
            </label>
            <select
              value={form.currency}
              onChange={(e) => update("currency", e.target.value)}
              className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
            >
              <option value="MXN">Peso mexicano (MXN)</option>
              <option value="USD">Dólar estadounidense (USD)</option>
              <option value="COP">Peso colombiano (COP)</option>
              <option value="ARS">Peso argentino (ARS)</option>
              <option value="PEN">Sol peruano (PEN)</option>
              <option value="CLP">Peso chileno (CLP)</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} className="w-full" loading={saving}>
        <Settings className="w-4 h-4" />
        Guardar cambios
      </Button>
    </div>
  );
}
