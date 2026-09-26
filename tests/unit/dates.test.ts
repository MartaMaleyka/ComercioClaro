import { describe, expect, it } from "vitest";
import { addDays, dayKey, dayKeysBetween, dayRange, startOfDay, zonedMidnight } from "@/lib/dates";

describe("fechas por zona horaria", () => {
  it("usa el día local del negocio y no el de UTC", () => {
    // 23:30 en Ciudad de México (UTC-6) ya es el día siguiente en UTC.
    const lateNight = new Date("2026-09-26T05:30:00Z");
    expect(dayKey(lateNight, "America/Mexico_City")).toBe("2026-09-25");
    expect(lateNight.toISOString().slice(0, 10)).toBe("2026-09-26");
  });

  it("calcula la medianoche local", () => {
    expect(zonedMidnight(2026, 9, 25, "America/Mexico_City").toISOString()).toBe("2026-09-25T06:00:00.000Z");
    expect(zonedMidnight(2026, 1, 15, "America/Bogota").toISOString()).toBe("2026-01-15T05:00:00.000Z");
  });

  it("respeta el horario de verano", () => {
    expect(zonedMidnight(2026, 7, 1, "America/New_York").toISOString()).toBe("2026-07-01T04:00:00.000Z");
    expect(zonedMidnight(2026, 1, 1, "America/New_York").toISOString()).toBe("2026-01-01T05:00:00.000Z");
  });

  it("inicio del día local", () => {
    expect(startOfDay(new Date("2026-09-26T05:30:00Z"), "America/Mexico_City").toISOString()).toBe(
      "2026-09-25T06:00:00.000Z"
    );
  });

  it("rango de días con fin exclusivo", () => {
    const r = dayRange("2026-09-01", "2026-09-30", "America/Mexico_City");
    expect(r.start.toISOString()).toBe("2026-09-01T06:00:00.000Z");
    expect(r.end.toISOString()).toBe("2026-10-01T06:00:00.000Z");
  });

  it("lista de días y suma de días", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(dayKeysBetween("2026-12-30", "2027-01-02")).toEqual(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
  });
});
