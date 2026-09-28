import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { bulkImport } from "@/server/bulk";
import { importProducts } from "@/server/catalog";
import { createOwner, hasDatabase, resetDatabase } from "../helpers";

describe.skipIf(!hasDatabase)("carga masiva", () => {
  beforeEach(resetDatabase);

  it("productos: crea, crea la categoría una sola vez y al actualizar solo cambia lo que trae el archivo", async () => {
    const owner = await createOwner();
    const first = await bulkImport(owner, "products", [
      { name: "Arroz 5 lb", barcode: "111", price: "3.95", cost: "3.10", category: "Granos", stock: "10", minStock: "4" },
      { name: "Frijol", price: "2.50", category: "granos" },
      { name: "Sin precio" },
    ]);
    expect(first).toMatchObject({ created: 2, updated: 0, errors: [{ row: 4, error: expect.stringMatching(/^Precio:/) }] });
    expect(await prisma.category.count({ where: { businessId: owner.businessId } })).toBe(1);

    const second = await bulkImport(owner, "products", [{ barcode: "111", name: "Arroz 5 lb", price: "4.10" }]);
    expect(second).toMatchObject({ created: 0, updated: 1, errors: [] });
    const arroz = await prisma.product.findFirstOrThrow({ where: { businessId: owner.businessId, barcode: "111" } });
    expect(Number(arroz.price)).toBe(4.1);
    expect(Number(arroz.cost)).toBe(3.1);
    expect(Number(arroz.minStock)).toBe(4);
    expect(Number(arroz.stock)).toBe(10);
    expect(arroz.categoryId).not.toBeNull();

    const log = await prisma.auditLog.findFirst({ where: { businessId: owner.businessId, action: "bulk.import" } });
    expect(log?.details).toMatchObject({ entity: "products", created: 2, errors: 1 });
  });

  it("el CSV de productos usa la misma lectura (acentos, montos con símbolo, líneas de la hoja)", async () => {
    const owner = await createOwner();
    const result = await importProducts(owner, "Nombre;Precio;Unidad\nQueso;$6.50;libra\nPan;abc;pza\n");
    expect(result).toMatchObject({ created: 1, errors: [{ row: 3 }] });
    const queso = await prisma.product.findFirstOrThrow({ where: { businessId: owner.businessId, name: "Queso" } });
    expect(queso.unit).toBe("LB");
  });

  it("categorías: las que ya existen no se duplican", async () => {
    const owner = await createOwner();
    await prisma.category.create({ data: { name: "Bebidas", businessId: owner.businessId } });
    const result = await bulkImport(owner, "categories", [{ name: "bebidas" }, { name: "Limpieza" }, { name: "Snacks" }]);
    expect(result).toMatchObject({ created: 2, skipped: 1, errors: [] });
  });

  it("clientes: se reconocen por teléfono y no se borra el límite de crédito si la columna no viene", async () => {
    const owner = await createOwner();
    await bulkImport(owner, "customers", [
      { name: "Juana", phone: "6000-0001", creditLimit: "50", marketingConsent: "sí" },
    ]);
    const result = await bulkImport(owner, "customers", [
      { name: "Juana Pérez", phone: "6000-0001" },
      { name: "Pedro" },
    ]);
    expect(result).toMatchObject({ created: 1, updated: 1, errors: [] });
    const juana = await prisma.customer.findFirstOrThrow({ where: { businessId: owner.businessId, phone: "6000-0001" } });
    expect(juana.name).toBe("Juana Pérez");
    expect(Number(juana.creditLimit)).toBe(50);
    expect(juana.marketingConsent).toBe(true);
    expect(juana.consentAt).not.toBeNull();
  });

  it("proveedores: se reconocen por nombre", async () => {
    const owner = await createOwner();
    await bulkImport(owner, "suppliers", [{ name: "Distribuidora", creditDays: "45" }]);
    const result = await bulkImport(owner, "suppliers", [{ name: "DISTRIBUIDORA", phone: "6700-0000" }]);
    expect(result).toMatchObject({ updated: 1 });
    const s = await prisma.supplier.findFirstOrThrow({ where: { businessId: owner.businessId } });
    expect(s).toMatchObject({ phone: "6700-0000", creditDays: 45 });
  });

  it("gastos: cada fila es un gasto, no sale de la caja y no se aceptan fechas futuras", async () => {
    const owner = await createOwner();
    await prisma.cashSession.create({
      data: { businessId: owner.businessId, openedById: owner.userId, openingAmount: 100 },
    });
    const result = await bulkImport(owner, "expenses", [
      { date: "01/08/2026", category: "Luz", amount: "85.40", paymentMethod: "efectivo" },
      { date: "01/08/2026", category: "Luz", amount: "85.40" },
      { date: "01/01/2099", category: "Renta", amount: "300" },
    ]);
    expect(result).toMatchObject({ created: 2, errors: [{ row: 4, error: "La fecha no puede ser futura" }] });
    const expenses = await prisma.expense.findMany({ where: { businessId: owner.businessId } });
    expect(expenses.every((e) => e.cashSessionId === null)).toBe(true);
  });

  it("empleados: se reconocen por cédula y al actualizar se conserva lo que no viene en el archivo", async () => {
    const owner = await createOwner();
    await bulkImport(owner, "employees", [
      { name: "Ana", idNumber: "8-1-1", salary: "650", hireDate: "01/02/2025", position: "Cajera" },
    ]);
    const result = await bulkImport(owner, "employees", [
      { name: "Ana Rodríguez", idNumber: "8-1-1", salary: "700", hireDate: "01/02/2025" },
    ]);
    expect(result).toMatchObject({ updated: 1, errors: [] });
    const ana = await prisma.employee.findFirstOrThrow({ where: { businessId: owner.businessId } });
    expect(ana).toMatchObject({ name: "Ana Rodríguez", position: "Cajera", frequency: "QUINCENAL" });
    expect(Number(ana.salary)).toBe(700);
  });

  it("rechaza más filas de las permitidas", async () => {
    const owner = await createOwner();
    const rows = Array.from({ length: 2001 }, (_, i) => ({ name: `C${i}` }));
    await expect(bulkImport(owner, "categories", rows)).rejects.toThrow(/Máximo 2000 filas/);
  });
});
