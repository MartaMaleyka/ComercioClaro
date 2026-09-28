"use client";

import { Suspense, useState } from "react";
import useSWR from "swr";
import { useRouter, useSearchParams } from "next/navigation";
import { HandCoins, Pencil, Plus, Printer, Trash2, UserPlus, Users } from "lucide-react";
import { api, fetcher } from "@/lib/client/api";
import { useFormat, todayKey } from "@/lib/client/format";
import { useText } from "@/lib/client/i18n";
import { cn } from "@/lib/utils";
import { useSession } from "@/components/providers/SessionProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Checkbox, Input, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { BulkImportButton } from "@/components/bulk/BulkImport";
import { ErrorState, ListSkeleton, PageHeader, Stat, ScrollArea } from "@/components/ui/Misc";

type Frequency = "QUINCENAL" | "MENSUAL";

interface Employee {
  id: string;
  name: string;
  idNumber: string | null;
  socialSecurityNumber: string | null;
  position: string | null;
  salary: number;
  frequency: Frequency;
  hireDate: string;
  vacationSince: string | null;
  active: boolean;
  pendingAdvances: number;
  accruals: { vacationDays: number; vacationAmount: number; years: number; seniorityAmount: number };
}

interface Line {
  id: string;
  employeeId: string;
  employee: Employee;
  salary: number;
  overtimeHours: number;
  overtime: number;
  thirteenth: number;
  gross: number;
  cssEmployee: number;
  eduEmployee: number;
  incomeTax: number;
  advances: number;
  otherDeduction: number;
  net: number;
  cssEmployer: number;
  eduEmployer: number;
  riskEmployer: number;
}

interface Run {
  id: string;
  frequency: Frequency;
  periodStart: string;
  periodEnd: string;
  status: "DRAFT" | "PAID";
  paidAt: string | null;
  paidMethod: string | null;
  contributionsPaidAt: string | null;
  gross: number;
  deductions: number;
  net: number;
  employerCost: number;
  lines: Line[];
}

const day = (key: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${key.slice(0, 10)}T12:00:00Z`)
  );

export default function PayrollPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Payroll />
    </Suspense>
  );
}

function Payroll() {
  const tr = useText();
  const router = useRouter();
  const params = useSearchParams();
  const tab = params.get("tab") === "planillas" ? "runs" : "employees";
  return (
    <div className="space-y-5">
      <PageHeader title={tr("Planilla")} description={tr("Empleados, quincenas, CSS, ISR y décimo tercer mes")} />
      <p role="note" className="rounded-xl bg-amber-50 text-amber-800 px-4 py-2 text-sm">
        {tr(
          "Los porcentajes de CSS, seguro educativo, riesgos profesionales e ISR son valores por defecto: verifícalos con tu contador en Configuración → Planilla."
        )}
      </p>
      <Tabs
        label={tr("Planilla")}
        tabs={[
          { value: "employees", label: tr("Empleados") },
          { value: "runs", label: tr("Planillas") },
        ]}
        value={tab}
        onChange={(t) => router.replace(t === "runs" ? "/planilla?tab=planillas" : "/planilla")}
      />
      {tab === "runs" ? <RunsTab /> : <EmployeesTab />}
    </div>
  );
}

function EmployeesTab() {
  const tr = useText();
  const fmt = useFormat();
  const { data, error, mutate } = useSWR<Employee[]>("/api/payroll/employees", fetcher);
  const [editing, setEditing] = useState<Employee | null | undefined>(undefined);
  const [advance, setAdvance] = useState<Employee | null>(null);

  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (!data) return <ListSkeleton />;
  const monthly = data.filter((e) => e.active).reduce((a, e) => a + e.salary, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <Stat
          label={tr("Salarios al mes")}
          value={fmt.money(monthly)}
          hint={tr("{n} empleados activos", { n: data.filter((e) => e.active).length })}
        />
        <div className="flex gap-2 flex-wrap">
          <BulkImportButton entity="employees" onDone={() => mutate()} />
          <Button onClick={() => setEditing(null)}>
            <UserPlus className="w-4 h-4" aria-hidden="true" /> {tr("Empleado")}
          </Button>
        </div>
      </div>
      {data.length === 0 ? (
        <EmptyState
          icon={Users}
          title={tr("Sin empleados")}
          description={tr("Agrega a tus empleados con su salario y su fecha de ingreso para calcular la planilla.")}
        />
      ) : (
        <ul className="space-y-2">
          {data.map((e) => (
            <li key={e.id}>
              <Card>
                <CardContent className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">
                      {e.name} {!e.active && <Badge tone="gray">{tr("Inactivo")}</Badge>}
                    </p>
                    <p className="text-xs text-slate-500">
                      {[
                        e.position,
                        e.idNumber && `${tr("Cédula")} ${e.idNumber}`,
                        e.socialSecurityNumber && `${tr("SS")} ${e.socialSecurityNumber}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p className="text-xs text-slate-500">
                      {tr("Vacaciones acumuladas: {days} días ({amount})", {
                        days: fmt.number(e.accruals.vacationDays, 1),
                        amount: fmt.money(e.accruals.vacationAmount),
                      })}{" "}
                      · {tr("Prima de antigüedad: {amount}", { amount: fmt.money(e.accruals.seniorityAmount) })}
                    </p>
                    {e.pendingAdvances > 0 && (
                      <Badge tone="amber" className="mt-1">
                        {tr("Adelanto por descontar: {amount}", { amount: fmt.money(e.pendingAdvances) })}
                      </Badge>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold tabular-nums text-slate-900">{fmt.money(e.salary)}</p>
                    <p className="text-xs text-slate-500">
                      {e.frequency === "QUINCENAL" ? tr("Quincenal") : tr("Mensual")}
                    </p>
                    <div className="flex gap-0.5 justify-end mt-1">
                      {e.active && (
                        <button
                          aria-label={tr("Adelanto a {name}", { name: e.name })}
                          onClick={() => setAdvance(e)}
                          className="p-2.5 rounded-lg hover:bg-slate-100 text-slate-500"
                        >
                          <HandCoins className="w-4 h-4" aria-hidden="true" />
                        </button>
                      )}
                      <button
                        aria-label={tr("Editar {name}", { name: e.name })}
                        onClick={() => setEditing(e)}
                        className="p-2.5 rounded-lg hover:bg-slate-100 text-slate-500"
                      >
                        <Pencil className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {editing !== undefined && (
        <EmployeeForm
          employee={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            mutate();
          }}
        />
      )}
      {advance && (
        <AdvanceForm
          employee={advance}
          onClose={() => setAdvance(null)}
          onSaved={() => {
            setAdvance(null);
            mutate();
          }}
        />
      )}
    </div>
  );
}

function EmployeeForm({
  employee,
  onClose,
  onSaved,
}: {
  employee: Employee | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const tr = useText();
  const toast = useToast();
  const { business } = useSession();
  const [form, setForm] = useState({
    name: employee?.name ?? "",
    idNumber: employee?.idNumber ?? "",
    socialSecurityNumber: employee?.socialSecurityNumber ?? "",
    position: employee?.position ?? "",
    salary: employee ? String(employee.salary) : "",
    frequency: employee?.frequency ?? "QUINCENAL",
    hireDate: employee?.hireDate.slice(0, 10) ?? todayKey(business.timezone),
    vacationSince: employee?.vacationSince?.slice(0, 10) ?? "",
    active: employee?.active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api(employee ? `/api/payroll/employees/${employee.id}` : "/api/payroll/employees", {
        method: employee ? "PUT" : "POST",
        body: form,
      });
      toast.success(tr("Empleado guardado"));
      onSaved();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={employee ? tr("Editar empleado") : tr("Nuevo empleado")}>
      <form onSubmit={save} className="space-y-3">
        <Input label={tr("Nombre")} value={form.name} onChange={(e) => set("name", e.target.value)} required />
        <div className="grid grid-cols-2 gap-3">
          <Input label={tr("Cédula")} value={form.idNumber} onChange={(e) => set("idNumber", e.target.value)} />
          <Input
            label={tr("Número de seguro social")}
            value={form.socialSecurityNumber}
            onChange={(e) => set("socialSecurityNumber", e.target.value)}
          />
        </div>
        <Input label={tr("Puesto")} value={form.position} onChange={(e) => set("position", e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label={tr("Salario mensual")}
            inputMode="decimal"
            value={form.salary}
            onChange={(e) => set("salary", e.target.value)}
            required
          />
          <Select
            label={tr("Se paga")}
            value={form.frequency}
            onChange={(e) => set("frequency", e.target.value as Frequency)}
          >
            <option value="QUINCENAL">{tr("Quincenal")}</option>
            <option value="MENSUAL">{tr("Mensual")}</option>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label={tr("Fecha de ingreso")}
            type="date"
            value={form.hireDate}
            onChange={(e) => set("hireDate", e.target.value)}
            required
          />
          <Input
            label={tr("Últimas vacaciones")}
            type="date"
            value={form.vacationSince}
            onChange={(e) => set("vacationSince", e.target.value)}
            hint={tr("Vacío: desde que entró")}
          />
        </div>
        <Checkbox label={tr("Activo")} checked={form.active} onChange={(e) => set("active", e.target.checked)} />
        <Button type="submit" className="w-full" loading={saving}>
          {tr("Guardar")}
        </Button>
      </form>
    </Modal>
  );
}

function AdvanceForm({ employee, onClose, onSaved }: { employee: Employee; onClose: () => void; onSaved: () => void }) {
  const tr = useText();
  const toast = useToast();
  const { business } = useSession();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/payroll/advances", { body: { employeeId: employee.id, amount, method, notes: null } });
      toast.success(tr("Adelanto registrado"));
      onSaved();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={tr("Adelanto a {name}", { name: employee.name })}>
      <form onSubmit={save} className="space-y-3">
        <p className="text-sm text-slate-600">{tr("Se descuenta en la siguiente planilla.")}</p>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label={tr("Monto")}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
          <Select label={tr("Forma")} value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="CASH">{tr("Efectivo (caja)")}</option>
            <option value="TRANSFER">{tr("Transferencia")}</option>
            {business.country === "PA" && <option value="YAPPY">{tr("Yappy")}</option>}
          </Select>
        </div>
        <Button type="submit" className="w-full" loading={saving}>
          {tr("Registrar adelanto")}
        </Button>
      </form>
    </Modal>
  );
}

function RunsTab() {
  const tr = useText();
  const fmt = useFormat();
  const toast = useToast();
  const { business } = useSession();
  const { data, error, mutate } = useSWR<Run[]>("/api/payroll/runs", fetcher);
  const [frequency, setFrequency] = useState<Frequency>("QUINCENAL");
  const [date, setDate] = useState(todayKey(business.timezone));
  const [creating, setCreating] = useState(false);
  const [openRun, setOpenRun] = useState<string | null>(null);

  async function create() {
    setCreating(true);
    try {
      const run = await api<Run>("/api/payroll/runs", { body: { frequency, date } });
      toast.success(tr("Planilla creada"));
      await mutate();
      setOpenRun(run.id);
    } catch (err) {
      toast.error(err);
    } finally {
      setCreating(false);
    }
  }

  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (!data) return <ListSkeleton />;
  const current = data.find((r) => r.id === openRun);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex items-end gap-3 flex-wrap">
          <Select
            label={tr("Tipo de planilla")}
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as Frequency)}
          >
            <option value="QUINCENAL">{tr("Quincenal")}</option>
            <option value="MENSUAL">{tr("Mensual")}</option>
          </Select>
          <Input
            label={tr("Del periodo que incluye")}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <Button onClick={create} loading={creating}>
            <Plus className="w-4 h-4" aria-hidden="true" /> {tr("Crear planilla")}
          </Button>
        </CardContent>
      </Card>
      {data.length === 0 ? (
        <p className="text-sm text-slate-500">{tr("Aún no hay planillas.")}</p>
      ) : (
        <ul className="space-y-2">
          {data.map((r) => (
            <li key={r.id}>
              <Card>
                <CardContent className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium text-slate-900">
                      {day(r.periodStart, fmt.locale)} – {day(r.periodEnd, fmt.locale)}{" "}
                      <Badge tone={r.status === "PAID" ? "green" : "amber"}>
                        {r.status === "PAID" ? tr("Pagada") : tr("Borrador")}
                      </Badge>
                    </p>
                    <p className="text-xs text-slate-500">
                      {r.frequency === "QUINCENAL" ? tr("Quincenal") : tr("Mensual")} ·{" "}
                      {tr("{n} empleados", { n: r.lines.length })}
                      {r.lines.some((l) => l.thirteenth > 0) && ` · ${tr("incluye décimo")}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold tabular-nums">{fmt.money(r.net)}</p>
                    <Button size="sm" variant="secondary" onClick={() => setOpenRun(r.id)}>
                      {tr("Ver detalle")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {current && <RunDetail run={current} onClose={() => setOpenRun(null)} onChanged={() => mutate()} />}
    </div>
  );
}

function RunDetail({ run, onClose, onChanged }: { run: Run; onClose: () => void; onChanged: () => void }) {
  const tr = useText();
  const fmt = useFormat();
  const toast = useToast();
  const confirm = useConfirm();
  const { business } = useSession();
  const [method, setMethod] = useState("TRANSFER");
  const [busy, setBusy] = useState(false);
  const draft = run.status === "DRAFT";

  async function call(url: string, body: unknown, message: string) {
    setBusy(true);
    try {
      await api(url, { body });
      toast.success(message);
      onChanged();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  async function updateLine(line: Line, patch: { overtimeHours?: string; otherDeduction?: string }) {
    try {
      await api(`/api/payroll/lines/${line.id}`, {
        method: "PUT",
        body: {
          overtimeHours: patch.overtimeHours ?? line.overtimeHours,
          otherDeduction: patch.otherDeduction ?? line.otherDeduction,
        },
      });
      onChanged();
    } catch (err) {
      toast.error(err);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: tr("Borrar planilla"),
      message: tr("Los adelantos vuelven a quedar pendientes."),
      confirmLabel: tr("Borrar"),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api(`/api/payroll/runs/${run.id}`, { method: "DELETE" });
      onClose();
      onChanged();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  const employerTotal = run.lines.reduce((a, l) => a + l.cssEmployer + l.eduEmployer + l.riskEmployer, 0);
  return (
    <Modal
      open
      onClose={onClose}
      title={tr("Planilla {from} – {to}", {
        from: day(run.periodStart, fmt.locale),
        to: day(run.periodEnd, fmt.locale),
      })}
      size="lg"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label={tr("Devengado")} value={fmt.money(run.gross)} />
          <Stat label={tr("Descuentos")} value={fmt.money(run.deductions)} />
          <Stat label={tr("Neto a pagar")} value={fmt.money(run.net)} tone="positive" />
          <Stat label={tr("Cuotas patronales")} value={fmt.money(employerTotal)} />
        </div>
        <ScrollArea label={tr("Detalle de la planilla")}>
          <table className="w-full text-sm min-w-[760px]">
            <caption className="sr-only">{tr("Detalle de la planilla")}</caption>
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th scope="col" className="py-1 font-medium">
                  {tr("Empleado")}
                </th>
                <th scope="col" className="py-1 font-medium text-right">
                  {tr("Salario")}
                </th>
                <th scope="col" className="py-1 font-medium text-right">
                  {tr("Horas extra")}
                </th>
                <th scope="col" className="py-1 font-medium text-right">
                  {tr("Décimo")}
                </th>
                <th scope="col" className="py-1 font-medium text-right">
                  {tr("CSS y S. E.")}
                </th>
                <th scope="col" className="py-1 font-medium text-right">
                  {tr("ISR")}
                </th>
                <th scope="col" className="py-1 font-medium text-right">
                  {tr("Adelantos y otros")}
                </th>
                <th scope="col" className="py-1 font-medium text-right">
                  {tr("Neto")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {run.lines.map((l) => (
                <tr key={l.id}>
                  <th scope="row" className="py-2 text-left font-normal text-slate-900">
                    {l.employee.name}
                  </th>
                  <td className="py-2 text-right tabular-nums">{fmt.money(l.salary)}</td>
                  <td className="py-2 text-right">
                    {draft ? (
                      <input
                        aria-label={tr("Horas extra de {name}", { name: l.employee.name })}
                        inputMode="decimal"
                        defaultValue={l.overtimeHours || ""}
                        placeholder="0"
                        onBlur={(e) => {
                          if (Number(e.target.value || 0) !== l.overtimeHours)
                            updateLine(l, { overtimeHours: e.target.value || "0" });
                        }}
                        className="w-16 text-right py-1 px-2 bg-surface border border-slate-200 rounded-lg"
                      />
                    ) : (
                      <span className="tabular-nums">{fmt.money(l.overtime)}</span>
                    )}
                  </td>
                  <td className="py-2 text-right tabular-nums">{l.thirteenth > 0 ? fmt.money(l.thirteenth) : "—"}</td>
                  <td className="py-2 text-right tabular-nums">−{fmt.money(l.cssEmployee + l.eduEmployee)}</td>
                  <td className="py-2 text-right tabular-nums">−{fmt.money(l.incomeTax)}</td>
                  <td className="py-2 text-right tabular-nums">−{fmt.money(l.advances + l.otherDeduction)}</td>
                  <td className={cn("py-2 text-right tabular-nums font-semibold", l.net < 0 && "text-red-600")}>
                    {fmt.money(l.net)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
        <div className="flex gap-2 flex-wrap items-end justify-between">
          <a
            href={`/planilla/${run.id}/comprobantes`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-xl bg-surface border border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            <Printer className="w-4 h-4" aria-hidden="true" /> {tr("Comprobantes de pago")}
          </a>
          {draft ? (
            <div className="flex gap-2 items-end flex-wrap">
              <Button variant="secondary" onClick={remove} loading={busy}>
                <Trash2 className="w-4 h-4" aria-hidden="true" /> {tr("Borrar")}
              </Button>
              <Select label={tr("Se paga con")} value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="TRANSFER">{tr("Transferencia")}</option>
                <option value="CASH">{tr("Efectivo (caja)")}</option>
                {business.country === "PA" && <option value="YAPPY">{tr("Yappy")}</option>}
              </Select>
              <Button
                onClick={() => call(`/api/payroll/runs/${run.id}/pay`, { method }, tr("Planilla pagada"))}
                loading={busy}
              >
                {tr("Pagar planilla")}
              </Button>
            </div>
          ) : run.contributionsPaidAt ? (
            <Badge tone="green">{tr("Cuotas a la CSS e ISR pagados")}</Badge>
          ) : (
            <Button
              variant="secondary"
              onClick={() => call(`/api/payroll/runs/${run.id}/contributions`, {}, tr("Pago a la CSS registrado"))}
              loading={busy}
            >
              {tr("Registrar pago a la CSS y del ISR")}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
