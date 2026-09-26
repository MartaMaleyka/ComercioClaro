/**
 * Antigüedad de saldos del fiado. Los abonos se aplican a las ventas más antiguas
 * primero (FIFO); lo que queda pendiente de una venta ya vencida es saldo vencido.
 */

export interface CreditCharge {
  id: string;
  folio: number;
  date: Date;
  dueDate: Date | null;
  /** Importe neto a cobrar (total menos devoluciones abonadas a la cuenta) */
  amount: number;
}

export interface AgingResult {
  balance: number;
  overdue: number;
  /** Días de atraso de la venta vencida más antigua */
  daysOverdue: number;
  /** Próximo vencimiento de lo no vencido */
  nextDueDate: Date | null;
  charges: (CreditCharge & { pending: number; overdue: boolean })[];
}

const round = (n: number) => Math.round(n * 100) / 100;

export function computeAging(charges: CreditCharge[], totalPayments: number, now = new Date()): AgingResult {
  let remainingPayments = totalPayments;
  const sorted = [...charges].sort((a, b) => a.date.getTime() - b.date.getTime());
  const result = sorted.map((c) => {
    const applied = Math.min(Math.max(remainingPayments, 0), c.amount);
    remainingPayments = round(remainingPayments - applied);
    const pending = round(c.amount - applied);
    const overdue = pending > 0 && c.dueDate !== null && c.dueDate.getTime() < now.getTime();
    return { ...c, pending, overdue };
  });

  const overdueCharges = result.filter((c) => c.overdue);
  const oldest = overdueCharges[0];
  const upcoming = result.filter((c) => c.pending > 0 && !c.overdue && c.dueDate);
  return {
    balance: round(result.reduce((acc, c) => acc + c.pending, 0)),
    overdue: round(overdueCharges.reduce((acc, c) => acc + c.pending, 0)),
    daysOverdue: oldest?.dueDate ? Math.floor((now.getTime() - oldest.dueDate.getTime()) / 86_400_000) : 0,
    nextDueDate: upcoming[0]?.dueDate ?? null,
    charges: result,
  };
}
