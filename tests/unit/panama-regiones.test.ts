import { describe, expect, it } from "vitest";
import { creditDueDate, currentPaydayEnd, nextPaydayKey } from "@/lib/credit-terms";

const TZ = "America/Panama";
// Mediodía en Panamá (UTC-5) del día indicado.
const at = (day: string) => new Date(`${day}T17:00:00Z`);

describe("quincena", () => {
  it("vence el 15 o el último día del mes siguiente a la venta", () => {
    expect(nextPaydayKey(at("2026-09-03"), TZ)).toBe("2026-09-15");
    expect(nextPaydayKey(at("2026-09-15"), TZ)).toBe("2026-09-30");
    expect(nextPaydayKey(at("2026-02-20"), TZ)).toBe("2026-02-28");
    expect(nextPaydayKey(at("2026-09-30"), TZ)).toBe("2026-10-15");
    expect(nextPaydayKey(at("2026-12-31"), TZ)).toBe("2027-01-15");
  });

  it("usa el día de Panamá aunque en UTC ya sea el día siguiente", () => {
    // 14 de septiembre a las 11 p. m. en Panamá = 15 de septiembre en UTC.
    expect(nextPaydayKey(new Date("2026-09-15T04:00:00Z"), TZ)).toBe("2026-09-15");
  });

  it("la deuda vence al terminar el día de pago", () => {
    const due = creditDueDate({ creditTerm: "QUINCENA", creditDays: 15, creditDueDate: null }, at("2026-09-03"), TZ);
    expect(due.toISOString()).toBe("2026-09-16T05:00:00.000Z");
    expect(currentPaydayEnd(at("2026-09-15"), TZ).toISOString()).toBe("2026-09-16T05:00:00.000Z");
    expect(currentPaydayEnd(at("2026-09-16"), TZ).toISOString()).toBe("2026-10-01T05:00:00.000Z");
  });

  it("fecha fija (cosecha) y regreso a días si ya pasó", () => {
    const harvest = new Date("2026-12-20T00:00:00Z");
    const fixed = { creditTerm: "FIXED", creditDays: 10, creditDueDate: harvest };
    expect(creditDueDate(fixed, at("2026-09-03"), TZ).toISOString()).toBe("2026-12-21T05:00:00.000Z");
    const late = creditDueDate(fixed, at("2026-12-22"), TZ);
    expect(late.getTime() - at("2026-12-22").getTime()).toBe(10 * 86_400_000);
  });
});
