import { notFound } from "next/navigation";
import { getAuth, hasFeature } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { D } from "@/lib/decimal";
import { formatCurrency } from "@/lib/utils";
import { getPayrollRun } from "@/server/payroll";
import { PrintButton } from "../../../ventas/[id]/ticket/PrintButton";

/** Comprobantes de pago de la planilla: uno por empleado, listos para imprimir y firmar. */
export default async function PayslipsPage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuth();
  if (!auth || auth.role !== "OWNER" || !hasFeature(auth, "payroll")) notFound();
  const { id } = await params;
  let run;
  try {
    run = await getPayrollRun(auth.businessId, id);
  } catch (err) {
    if (err instanceof AppError && err.status === 404) notFound();
    throw err;
  }
  const b = auth.business;
  const money = (n: { toNumber(): number } | number) => formatCurrency(Number(n), b.currency, b.locale, b.showBalboa);
  const day = (key: string) =>
    new Intl.DateTimeFormat(b.locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
      new Date(`${key}T12:00:00Z`)
    );

  return (
    <main className="max-w-2xl mx-auto p-6 space-y-8 text-sm">
      <div className="print:hidden flex justify-end">
        <PrintButton />
      </div>
      {run.lines.map((l) => {
        const rows: [string, { toNumber(): number } | number, boolean?][] = [
          ["Salario del periodo", l.salary],
          [`Horas extra (${D(l.overtimeHours).toNumber()} h)`, l.overtime],
          ["Décimo tercer mes", l.thirteenth],
          ["Total devengado", l.gross, true],
          ["Seguro social (CSS)", D(l.cssEmployee).neg()],
          ["Seguro educativo", D(l.eduEmployee).neg()],
          ["Impuesto sobre la renta", D(l.incomeTax).neg()],
          ["Adelantos", D(l.advances).neg()],
          ["Otros descuentos", D(l.otherDeduction).neg()],
        ];
        return (
          <section key={l.id} className="border border-black p-5 break-inside-avoid space-y-3">
            <header className="flex justify-between gap-4">
              <div>
                <h1 className="font-bold text-base">{b.name}</h1>
                {b.ruc && (
                  <p>
                    RUC {b.ruc}
                    {b.dv ? ` DV ${b.dv}` : ""}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="font-bold">Comprobante de pago</p>
                <p>
                  {day(run.periodStart)} al {day(run.periodEnd)}
                </p>
              </div>
            </header>
            <p>
              <strong>{l.employee.name}</strong>
              {l.employee.position && ` · ${l.employee.position}`}
              {l.employee.idNumber && ` · Cédula ${l.employee.idNumber}`}
              {l.employee.socialSecurityNumber && ` · SS ${l.employee.socialSecurityNumber}`}
            </p>
            <table className="w-full">
              <tbody>
                {rows
                  .filter(([, amount]) => Number(amount) !== 0)
                  .map(([label, amount, bold]) => (
                    <tr key={label} className={bold ? "font-bold border-t border-black" : ""}>
                      <th scope="row" className="text-left font-normal py-0.5">
                        {label}
                      </th>
                      <td className="text-right tabular-nums">{money(amount)}</td>
                    </tr>
                  ))}
                <tr className="font-bold border-t-2 border-black">
                  <th scope="row" className="text-left py-1">
                    Neto a pagar
                  </th>
                  <td className="text-right tabular-nums">{money(l.net)}</td>
                </tr>
              </tbody>
            </table>
            <p className="text-xs">
              Aportes del empleador: CSS {money(l.cssEmployer)} · Seguro educativo {money(l.eduEmployer)} · Riesgos
              profesionales {money(l.riskEmployer)}
            </p>
            <div className="pt-8 flex justify-between text-xs">
              <span className="border-t border-black pt-1 w-48 text-center">Firma del empleado</span>
              <span className="border-t border-black pt-1 w-48 text-center">Firma del empleador</span>
            </div>
          </section>
        );
      })}
    </main>
  );
}
