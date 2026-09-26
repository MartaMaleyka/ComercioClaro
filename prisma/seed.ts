import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/auth";
import { createProduct } from "../src/server/catalog";
import { createPurchase } from "../src/server/purchases";
import { createSale } from "../src/server/sales";
import { addCustomerPayment } from "../src/server/customers";
import { openCashSession } from "../src/server/cash";

const DEMO_EMAIL = "demo@comercioclaro.com";
const DEMO_PASSWORD = "demo1234";
const CASHIER_EMAIL = "cajero@comercioclaro.com";

/** Generador pseudoaleatorio con semilla para que los datos sean reproducibles. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (existing) {
    console.log("ℹ️  La cuenta de demostración ya existe; no se modificó.");
    return;
  }

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const owner = await prisma.user.create({
    data: {
      email: DEMO_EMAIL,
      passwordHash,
      name: "María García",
      memberships: {
        create: {
          role: "OWNER",
          business: {
            create: {
              name: "Miscelánea La Esperanza",
              description: "Tu tienda de confianza en el barrio",
              phone: "55 1234 5678",
              address: "Av. Principal #123, Col. Centro",
              postalCode: "06000",
              lowStockEmailAlerts: true,
            },
          },
        },
      },
    },
    include: { memberships: true },
  });
  const businessId = owner.memberships[0].businessId;
  const actor = { userId: owner.id, businessId, role: "OWNER" as const };

  await prisma.user.create({
    data: {
      email: CASHIER_EMAIL,
      passwordHash,
      name: "Luis Pérez",
      memberships: { create: { role: "CASHIER", businessId } },
    },
  });

  const categoryNames = ["Bebidas", "Botanas", "Abarrotes", "Lácteos", "Panadería", "Granel"];
  const categories = Object.fromEntries(
    await Promise.all(
      categoryNames.map(async (name) => [name, (await prisma.category.create({ data: { name, businessId } })).id])
    )
  ) as Record<string, string>;

  const catalog = [
    { name: "Coca-Cola 600ml", barcode: "7501055300075", category: "Bebidas", price: 18, cost: 12, stock: 120, minStock: 12, iepsRate: 0.08 },
    { name: "Agua Bonafont 1L", barcode: "7501055900015", category: "Bebidas", price: 12, cost: 7, stock: 60, minStock: 10 },
    { name: "Sabritas Original 45g", barcode: "7501011111112", category: "Botanas", price: 18, cost: 11, stock: 80, minStock: 10, iepsRate: 0.08 },
    { name: "Galletas Marías 170g", barcode: "7501000112345", category: "Botanas", price: 16, cost: 10.5, stock: 60, minStock: 6, taxRate: 0 },
    { name: "Leche Lala 1L", barcode: "7501020515343", category: "Lácteos", price: 28, cost: 22, stock: 50, minStock: 6, taxRate: 0, trackExpiry: true },
    { name: "Yoghurt Danone 1kg", barcode: "7501032901234", category: "Lácteos", price: 45, cost: 34, stock: 30, minStock: 4, taxRate: 0, trackExpiry: true },
    { name: "Pan Bimbo Grande", barcode: "7441029500015", category: "Panadería", price: 48, cost: 36, stock: 40, minStock: 5, taxRate: 0, trackExpiry: true },
    { name: "Aceite 1-2-3 1L", barcode: "7501039120012", category: "Abarrotes", price: 42, cost: 33, stock: 40, minStock: 4, taxRate: 0 },
    { name: "Frijol negro", category: "Granel", unit: "KG" as const, price: 38, cost: 26, stock: 60, minStock: 5, taxRate: 0, wholesalePrice: 34, wholesaleMinQty: 5, satUnitKey: "KGM" },
    { name: "Arroz", category: "Granel", unit: "KG" as const, price: 32, cost: 21, stock: 70, minStock: 5, taxRate: 0, wholesalePrice: 29, wholesaleMinQty: 5, satUnitKey: "KGM" },
    { name: "Huevo", category: "Granel", unit: "KG" as const, price: 52, cost: 41, stock: 50, minStock: 3, taxRate: 0, satUnitKey: "KGM" },
  ];

  const products = [];
  for (const p of catalog) {
    const { category, ...data } = p;
    products.push(
      await createProduct(actor, {
        unit: "PIECE",
        description: null,
        sku: null,
        barcode: null,
        wholesalePrice: null,
        wholesaleMinQty: null,
        taxRate: 0.16,
        iepsRate: 0,
        trackExpiry: false,
        satProductKey: "01010101",
        satUnitKey: "H87",
        ...data,
        categoryId: categories[category],
      })
    );
  }

  const supplier = await prisma.supplier.create({
    data: { name: "Distribuidora del Valle", phone: "55 8765 4321", contact: "Jorge", businessId },
  });

  const random = rng(42);
  const daysAgo = (days: number, hour = 12) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    d.setHours(hour, Math.floor(random() * 60), 0, 0);
    return d;
  };

  // Compra con caducidades
  const purchase = await createPurchase(actor, {
    supplierId: supplier.id,
    supplierName: null,
    notes: "Pedido semanal",
    paidFromCash: false,
    items: [
      { productId: products[0].id, quantity: 24, unitCost: 12.5, lotCode: null, expiresAt: null },
      { productId: products[4].id, quantity: 12, unitCost: 22, lotCode: "L-2291", expiresAt: daysAgo(-5) },
      { productId: products[6].id, quantity: 10, unitCost: 36, lotCode: null, expiresAt: daysAgo(-3) },
    ],
  });
  await prisma.purchase.update({ where: { id: purchase.id }, data: { createdAt: daysAgo(20, 9) } });

  const customers = await Promise.all([
    prisma.customer.create({ data: { name: "Doña Carmen", phone: "55 1111 2222", creditLimit: 500, businessId } }),
    prisma.customer.create({ data: { name: "Don Beto", phone: "55 3333 4444", creditLimit: 300, businessId } }),
  ]);

  // Ventas de los últimos 30 días
  for (let day = 29; day >= 0; day--) {
    const count = 3 + Math.floor(random() * 5);
    for (let s = 0; s < count; s++) {
      const lines = new Map<string, number>();
      const n = 1 + Math.floor(random() * 3);
      for (let k = 0; k < n; k++) {
        const product = products[Math.floor(random() * products.length)];
        const q = product.unit === "PIECE" ? 1 + Math.floor(random() * 2) : Math.round((0.25 + random()) * 4) / 4;
        lines.set(product.id, (lines.get(product.id) ?? 0) + q);
      }
      const credit = random() < 0.08;
      const method = credit ? "CREDIT" : random() < 0.8 ? "CASH" : random() < 0.5 ? "CARD" : "TRANSFER";
      try {
        const sale = await createSale(actor, {
          items: [...lines].map(([productId, quantity]) => ({ productId, quantity, discount: 0 })),
          discount: 0,
          paymentMethod: method,
          customerId: credit ? customers[Math.floor(random() * customers.length)].id : null,
          notes: null,
        });
        const createdAt = daysAgo(day, 8 + Math.floor(random() * 12));
        await prisma.sale.update({ where: { id: sale.id }, data: { createdAt } });
        await prisma.stockMovement.updateMany({ where: { referenceId: sale.id }, data: { createdAt } });
      } catch {
        // Sin existencias o límite de crédito: se omite la venta.
      }
    }
  }

  await addCustomerPayment(actor, customers[0].id, { amount: 50, method: "CASH", notes: "Abono semanal" }).catch(() => {});

  const expenses = [
    { category: "Renta", amount: 3500, days: 25 },
    { category: "Luz", amount: 680, days: 15 },
    { category: "Agua", amount: 220, days: 12 },
    { category: "Internet", amount: 399, days: 5 },
  ];
  for (const e of expenses) {
    await prisma.expense.create({
      data: { category: e.category, amount: e.amount, paymentMethod: "TRANSFER", date: daysAgo(e.days), userId: owner.id, businessId },
    });
  }

  await openCashSession(actor, { openingAmount: 500, notes: "Fondo inicial" });

  console.log("✅ Datos de demostración creados");
  console.log(`   Dueño:  ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`   Cajero: ${CASHIER_EMAIL} / ${DEMO_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
