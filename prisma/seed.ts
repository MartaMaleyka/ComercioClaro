import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/auth";
import { createProduct } from "../src/server/catalog";
import { createPurchase } from "../src/server/purchases";
import { createSale } from "../src/server/sales";
import { addCustomerPayment } from "../src/server/customers";
import { openCashSession } from "../src/server/cash";
import { syncDeliveryZones } from "../src/server/delivery";
import type { Prisma } from "../src/generated/prisma/client";

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

async function seedMexico() {
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
    {
      name: "Coca-Cola 600ml",
      barcode: "7501055300075",
      category: "Bebidas",
      price: 18,
      cost: 12,
      stock: 120,
      minStock: 12,
      iepsRate: 0.08,
    },
    {
      name: "Agua Bonafont 1L",
      barcode: "7501055900015",
      category: "Bebidas",
      price: 12,
      cost: 7,
      stock: 60,
      minStock: 10,
    },
    {
      name: "Sabritas Original 45g",
      barcode: "7501011111112",
      category: "Botanas",
      price: 18,
      cost: 11,
      stock: 80,
      minStock: 10,
      iepsRate: 0.08,
    },
    {
      name: "Galletas Marías 170g",
      barcode: "7501000112345",
      category: "Botanas",
      price: 16,
      cost: 10.5,
      stock: 60,
      minStock: 6,
      taxRate: 0,
    },
    {
      name: "Leche Lala 1L",
      barcode: "7501020515343",
      category: "Lácteos",
      price: 28,
      cost: 22,
      stock: 50,
      minStock: 6,
      taxRate: 0,
      trackExpiry: true,
    },
    {
      name: "Yoghurt Danone 1kg",
      barcode: "7501032901234",
      category: "Lácteos",
      price: 45,
      cost: 34,
      stock: 30,
      minStock: 4,
      taxRate: 0,
      trackExpiry: true,
    },
    {
      name: "Pan Bimbo Grande",
      barcode: "7441029500015",
      category: "Panadería",
      price: 48,
      cost: 36,
      stock: 40,
      minStock: 5,
      taxRate: 0,
      trackExpiry: true,
    },
    {
      name: "Aceite 1-2-3 1L",
      barcode: "7501039120012",
      category: "Abarrotes",
      price: 42,
      cost: 33,
      stock: 40,
      minStock: 4,
      taxRate: 0,
    },
    {
      name: "Frijol negro",
      category: "Granel",
      unit: "KG" as const,
      price: 38,
      cost: 26,
      stock: 60,
      minStock: 5,
      taxRate: 0,
      wholesalePrice: 34,
      wholesaleMinQty: 5,
      satUnitKey: "KGM",
    },
    {
      name: "Arroz",
      category: "Granel",
      unit: "KG" as const,
      price: 32,
      cost: 21,
      stock: 70,
      minStock: 5,
      taxRate: 0,
      wholesalePrice: 29,
      wholesaleMinQty: 5,
      satUnitKey: "KGM",
    },
    {
      name: "Huevo",
      category: "Granel",
      unit: "KG" as const,
      price: 52,
      cost: 41,
      stock: 50,
      minStock: 3,
      taxRate: 0,
      satUnitKey: "KGM",
    },
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

  await addCustomerPayment(actor, customers[0].id, { amount: 50, method: "CASH", notes: "Abono semanal" }).catch(
    () => {}
  );

  const expenses = [
    { category: "Renta", amount: 3500, days: 25 },
    { category: "Luz", amount: 680, days: 15 },
    { category: "Agua", amount: 220, days: 12 },
    { category: "Internet", amount: 399, days: 5 },
  ];
  for (const e of expenses) {
    await prisma.expense.create({
      data: {
        category: e.category,
        amount: e.amount,
        paymentMethod: "TRANSFER",
        date: daysAgo(e.days),
        userId: owner.id,
        businessId,
      },
    });
  }

  await openCashSession(actor, { openingAmount: 500, notes: "Fondo inicial" });

  console.log("✅ Datos de demostración creados");
  console.log(`   Dueño:  ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`   Cajero: ${CASHIER_EMAIL} / ${DEMO_PASSWORD}`);
}

const PA_EMAIL = "demo.pa@comercioclaro.com";
const PA_CASHIER_EMAIL = "cajero.pa@comercioclaro.com";

/** Minisúper panameño: ITBMS 0/7/10/15%, B/., Yappy, fiado a 15 días y facturador gratuito. */
async function seedPanama() {
  const existing = await prisma.user.findUnique({ where: { email: PA_EMAIL } });
  if (existing) {
    console.log("ℹ️  La cuenta de demostración de Panamá ya existe; no se modificó.");
    return;
  }

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const owner = await prisma.user.create({
    data: {
      email: PA_EMAIL,
      passwordHash,
      name: "Wei Chen",
      memberships: {
        create: {
          role: "OWNER",
          business: {
            create: {
              name: "Minisúper El Dorado",
              description: "Abarrotería y minisúper",
              phone: "6123-4567",
              address: "Vía Ricardo J. Alfaro, El Dorado, Panamá",
              country: "PA",
              currency: "USD",
              locale: "es-PA",
              timezone: "America/Panama",
              showBalboa: true,
              ruc: "8-812-2345",
              dv: "45",
              legalName: "Wei Chen",
              usesFreeInvoicer: true,
              yappyDirectory: "@minisupereldorado",
              cardFeeRate: 0.029,
              yappyFeeRate: 0.0107,
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
      email: PA_CASHIER_EMAIL,
      passwordHash,
      name: "Li Na",
      language: "zh",
      memberships: { create: { role: "CASHIER", businessId } },
    },
  });

  const categoryNames = ["Abarrotes", "Bebidas", "Cervezas", "Cigarrillos", "Lácteos y huevos", "Limpieza"];
  const categories = Object.fromEntries(
    await Promise.all(
      categoryNames.map(async (name) => [name, (await prisma.category.create({ data: { name, businessId } })).id])
    )
  ) as Record<string, string>;

  const catalog = [
    {
      name: "Arroz Blue Ribbon 5 lb",
      barcode: "7451001000011",
      category: "Abarrotes",
      price: 3.95,
      cost: 3.1,
      stock: 180,
      minStock: 10,
      taxRate: 0,
    },
    {
      name: "Frijoles rojos 1 lb",
      barcode: "7451001000028",
      category: "Abarrotes",
      price: 1.35,
      cost: 0.95,
      stock: 240,
      minStock: 12,
      taxRate: 0,
    },
    {
      name: "Aceite Clover 1 L",
      barcode: "7451001000035",
      category: "Abarrotes",
      price: 3.25,
      cost: 2.6,
      stock: 90,
      minStock: 6,
      taxRate: 0,
    },
    {
      name: "Coca-Cola 2 L",
      barcode: "7451001000042",
      category: "Bebidas",
      price: 2.1,
      cost: 1.55,
      stock: 216,
      minStock: 12,
      taxRate: 0.07,
    },
    {
      name: "Agua Cristalina 600 ml",
      barcode: "7451001000059",
      category: "Bebidas",
      price: 0.75,
      cost: 0.4,
      stock: 288,
      minStock: 24,
      taxRate: 0.07,
      packSize: 24,
    },
    {
      name: "Cerveza Panamá lata",
      barcode: "7451001000066",
      category: "Cervezas",
      price: 1.0,
      cost: 0.68,
      stock: 432,
      minStock: 24,
      taxRate: 0.1,
      packSize: 24,
      wholesalePrice: 0.9,
      wholesaleMinQty: 12,
    },
    {
      name: "Cerveza Balboa lata",
      barcode: "7451001000073",
      category: "Cervezas",
      price: 1.1,
      cost: 0.75,
      stock: 288,
      minStock: 24,
      taxRate: 0.1,
      packSize: 24,
    },
    {
      name: "Cigarrillo suelto",
      barcode: "7451001000080",
      category: "Cigarrillos",
      price: 0.35,
      cost: 0.24,
      stock: 600,
      minStock: 40,
      taxRate: 0.15,
      packSize: 20,
    },
    {
      name: "Leche Estrella Azul 1 L",
      barcode: "7451001000097",
      category: "Lácteos y huevos",
      price: 1.65,
      cost: 1.3,
      stock: 120,
      minStock: 12,
      taxRate: 0,
      trackExpiry: true,
    },
    {
      name: "Huevo (unidad)",
      barcode: "7451001000103",
      category: "Lácteos y huevos",
      price: 0.2,
      cost: 0.14,
      stock: 540,
      minStock: 60,
      taxRate: 0,
      packSize: 30,
    },
    {
      name: "Detergente Ace 1 kg",
      barcode: "7451001000110",
      category: "Limpieza",
      price: 3.6,
      cost: 2.75,
      stock: 60,
      minStock: 5,
      taxRate: 0.07,
    },
  ];

  const products = [];
  for (const p of catalog) {
    const { category, ...data } = p;
    products.push(
      await createProduct(actor, {
        unit: "PIECE",
        description: null,
        sku: null,
        wholesalePrice: null,
        wholesaleMinQty: null,
        iepsRate: 0,
        trackExpiry: false,
        packSize: null,
        satProductKey: "01010101",
        satUnitKey: "H87",
        ...data,
        categoryId: categories[category],
      })
    );
  }

  await prisma.supplier.createMany({
    data: [
      { name: "Distribuidora Cervecería Nacional", phone: "6200-1111", contact: "Carlos", businessId },
      { name: "Abarrotes Mayoristas del Istmo", phone: "6300-2222", contact: "Rosa", businessId },
    ],
  });

  const customers = await Promise.all([
    prisma.customer.create({
      data: { name: "Señora Maritza", phone: "6555-1234", creditLimit: 60, creditDays: 15, businessId },
    }),
    prisma.customer.create({
      data: { name: "Don Aurelio", phone: "6555-9876", creditLimit: 40, creditDays: 15, businessId },
    }),
  ]);

  const random = rng(7);
  const daysAgo = (days: number, hour = 12) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    d.setHours(hour, Math.floor(random() * 60), 0, 0);
    return d;
  };

  for (let day = 29; day >= 0; day--) {
    const count = 4 + Math.floor(random() * 6);
    for (let s = 0; s < count; s++) {
      const lines = new Map<string, number>();
      const n = 1 + Math.floor(random() * 3);
      for (let k = 0; k < n; k++) {
        const product = products[Math.floor(random() * products.length)];
        lines.set(product.id, (lines.get(product.id) ?? 0) + 1 + Math.floor(random() * 3));
      }
      const r = random();
      const credit = r < 0.08;
      const method = credit ? "CREDIT" : r < 0.6 ? "CASH" : r < 0.88 ? "YAPPY" : "CARD";
      try {
        const sale = await createSale(actor, {
          items: [...lines].map(([productId, quantity]) => ({ productId, quantity, discount: 0 })),
          discount: 0,
          paymentMethod: method,
          paymentReference: method === "YAPPY" ? String(100000 + Math.floor(random() * 899999)) : null,
          customerId: credit ? customers[Math.floor(random() * customers.length)].id : null,
          notes: null,
        });
        const createdAt = daysAgo(day, 7 + Math.floor(random() * 14));
        await prisma.sale.update({
          where: { id: sale.id },
          data: { createdAt, dueDate: credit ? new Date(createdAt.getTime() + 15 * 86_400_000) : null },
        });
        await prisma.stockMovement.updateMany({ where: { referenceId: sale.id }, data: { createdAt } });
      } catch {
        // Sin existencias o límite de crédito: se omite la venta.
      }
    }
  }

  for (const e of [
    { category: "Alquiler", amount: 650, days: 26 },
    { category: "Luz", amount: 185, days: 14 },
    { category: "Agua", amount: 18, days: 12 },
    { category: "Internet / teléfono", amount: 42, days: 6 },
  ]) {
    await prisma.expense.create({
      data: {
        category: e.category,
        amount: e.amount,
        paymentMethod: "TRANSFER",
        date: daysAgo(e.days),
        userId: owner.id,
        businessId,
      },
    });
  }

  // Funciones de la ronda 5: promoción de cerveza, puntos de lealtad y catálogo por WhatsApp.
  const beer = products.find((p) => p.name === "Cerveza Panamá lata")!;
  await prisma.promotion.create({
    data: {
      name: "6 Cerveza Panamá por B/.5.00",
      type: "BUNDLE_PRICE",
      bundleQty: 6,
      bundlePrice: 5,
      productId: beer.id,
      businessId,
    },
  });
  await prisma.business.update({
    where: { id: businessId },
    data: {
      loyaltyEnabled: true,
      catalogEnabled: true,
      catalogSlug: "minisuper-el-dorado",
      catalogWhatsapp: "61234567",
      region: "CAPITAL",
      offlineDays: 7,
    },
  });
  // Capital: entrega a domicilio con costo por corregimiento.
  const zones = await prisma.$transaction((tx) =>
    syncDeliveryZones(tx, businessId, [
      { name: "El Dorado", fee: 1.5 },
      { name: "Betania", fee: 2 },
      { name: "Bethania · Villa de las Fuentes", fee: 2.5 },
      { name: "San Francisco", fee: 3 },
    ])
  );
  await prisma.business.update({
    where: { id: businessId },
    data: { deliveryZones: zones as unknown as Prisma.InputJsonValue },
  });

  await openCashSession(actor, { openingAmount: 50, notes: "Fondo inicial" });

  console.log("✅ Demostración de Panamá creada");
  console.log(`   Dueño:  ${PA_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`   Cajero: ${PA_CASHIER_EMAIL} / ${DEMO_PASSWORD} (interfaz en chino)`);
  console.log("   Catálogo público: /c/minisuper-el-dorado");
}

const FONDA_EMAIL = "demo.fonda@comercioclaro.com";

/** Fonda panameña en modo restaurante: cuentas por mesa, cocina, extras y variantes. */
async function seedFonda() {
  const existing = await prisma.user.findUnique({ where: { email: FONDA_EMAIL } });
  if (existing) return;
  const owner = await prisma.user.create({
    data: {
      email: FONDA_EMAIL,
      passwordHash: await hashPassword(DEMO_PASSWORD),
      name: "Rosa Pérez",
      memberships: {
        create: {
          role: "OWNER",
          business: {
            create: {
              name: "Fonda La Chiricana",
              description: "Comida típica panameña",
              address: "Calle 50, Bella Vista, Panamá",
              country: "PA",
              currency: "USD",
              locale: "es-PA",
              timezone: "America/Panama",
              showBalboa: true,
              restaurantMode: true,
              yappyDirectory: "@fondachiricana",
              region: "CAPITAL",
              // Ley 6 de 1987: 25% a jubilados en restaurantes.
              seniorDiscountRate: 0.25,
            },
          },
        },
      },
    },
    include: { memberships: true },
  });
  const businessId = owner.memberships[0].businessId;
  const actor = { userId: owner.id, businessId, role: "OWNER" as const };
  const base = {
    description: null,
    sku: null,
    barcode: null,
    unit: "PIECE" as const,
    wholesalePrice: null,
    wholesaleMinQty: null,
    minStock: 5,
    trackExpiry: false,
    packSize: null,
    iepsRate: 0,
    satProductKey: "01010101",
    satUnitKey: "H87",
    categoryId: null,
  };
  const dishes = [
    {
      name: "Sancocho",
      price: 4.5,
      cost: 1.8,
      stock: 60,
      taxRate: 0,
      modifiers: [{ id: "arroz", name: "Arroz", price: 1 }],
    },
    {
      name: "Pollo guisado con arroz",
      price: 5,
      cost: 2,
      stock: 60,
      taxRate: 0,
      modifiers: [
        { id: "tajadas", name: "Tajadas", price: 1 },
        { id: "ensalada", name: "Ensalada de papa", price: 0.75 },
      ],
    },
    { name: "Carimañola", price: 0.75, cost: 0.25, stock: 100, taxRate: 0, modifiers: null },
  ];
  for (const d of dishes) {
    await createProduct(actor, { ...base, ...d, sendToKitchen: true });
  }
  for (const [label, price] of [
    ["Pequeña", 1],
    ["Grande", 1.75],
  ] as const) {
    await createProduct(actor, {
      ...base,
      name: `Chicha de maracuyá ${label.toLowerCase()}`,
      price,
      cost: 0.3,
      stock: 80,
      taxRate: 0.07,
      variantGroup: "Chicha de maracuyá",
      variantLabel: label,
    });
  }
  await createProduct(actor, { ...base, name: "Soda en lata", price: 1, cost: 0.55, stock: 120, taxRate: 0.07 });
  await openCashSession(actor, { openingAmount: 40, notes: "Fondo inicial" });
  console.log("✅ Demostración de fonda (modo restaurante) creada");
  console.log(`   Dueña: ${FONDA_EMAIL} / ${DEMO_PASSWORD}`);
}

const INTERIOR_EMAIL = "demo.interior@comercioclaro.com";

/** Abarrotería del interior: venta por libra, fiado a la quincena y a la cosecha, y efectivo. */
async function seedInterior() {
  const existing = await prisma.user.findUnique({ where: { email: INTERIOR_EMAIL } });
  if (existing) return;
  const owner = await prisma.user.create({
    data: {
      email: INTERIOR_EMAIL,
      passwordHash: await hashPassword(DEMO_PASSWORD),
      name: "Yamileth Batista",
      memberships: {
        create: {
          role: "OWNER",
          business: {
            create: {
              name: "Abarrotería Los Santos",
              description: "Abarrotería de pueblo",
              address: "Calle principal, Las Tablas, Los Santos",
              country: "PA",
              currency: "USD",
              locale: "es-PA",
              timezone: "America/Panama",
              showBalboa: true,
              region: "INTERIOR",
              offlineDays: 30,
            },
          },
        },
      },
    },
    include: { memberships: true },
  });
  const businessId = owner.memberships[0].businessId;
  const actor = { userId: owner.id, businessId, role: "OWNER" as const };
  const base = {
    description: null,
    sku: null,
    barcode: null,
    wholesalePrice: null,
    wholesaleMinQty: null,
    trackExpiry: false,
    packSize: null,
    iepsRate: 0,
    satProductKey: "01010101",
    categoryId: null,
  };
  const products = [];
  for (const p of [
    { name: "Arroz (libra)", unit: "LB" as const, price: 0.55, cost: 0.42, stock: 300, minStock: 50, taxRate: 0 },
    { name: "Frijol chiricano (libra)", unit: "LB" as const, price: 1.25, cost: 0.95, stock: 80, minStock: 15, taxRate: 0 },
    { name: "Azúcar (libra)", unit: "LB" as const, price: 0.6, cost: 0.45, stock: 120, minStock: 20, taxRate: 0 },
    { name: "Queso blanco (libra)", unit: "LB" as const, price: 3.25, cost: 2.4, stock: 25, minStock: 5, taxRate: 0 },
    { name: "Aceite (galón)", unit: "PIECE" as const, price: 9.5, cost: 7.8, stock: 12, minStock: 3, taxRate: 0 },
    { name: "Sardina en lata", unit: "PIECE" as const, price: 1.1, cost: 0.8, stock: 60, minStock: 12, taxRate: 0 },
    { name: "Soda 2 L", unit: "PIECE" as const, price: 2.1, cost: 1.5, stock: 36, minStock: 6, taxRate: 0.07 },
  ]) {
    products.push(await createProduct(actor, { ...base, satUnitKey: p.unit === "LB" ? "LBR" : "H87", ...p }));
  }
  const harvest = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 3, 15));
  const [worker, farmer] = await Promise.all([
    prisma.customer.create({
      data: { name: "Chelo (jornalero)", creditLimit: 40, creditTerm: "QUINCENA", businessId },
    }),
    prisma.customer.create({
      data: { name: "Don Nando (productor)", creditLimit: 150, creditTerm: "FIXED", creditDueDate: harvest, businessId },
    }),
  ]);
  const [rice, beans, , cheese] = products;
  await createSale(actor, {
    items: [
      { productId: rice.id, quantity: 5, discount: 0 },
      { productId: beans.id, quantity: 2, discount: 0 },
    ],
    discount: 0,
    paymentMethod: "CREDIT",
    customerId: worker.id,
    notes: null,
  });
  await createSale(actor, {
    items: [
      { productId: rice.id, quantity: 25, discount: 0 },
      { productId: cheese.id, quantity: 1.5, discount: 0 },
    ],
    discount: 0,
    paymentMethod: "CREDIT",
    customerId: farmer.id,
    notes: null,
  });
  await openCashSession(actor, { openingAmount: 30, notes: "Fondo inicial" });
  console.log("✅ Demostración del interior creada (libras, fiado a la quincena y a la cosecha)");
  console.log(`   Dueña: ${INTERIOR_EMAIL} / ${DEMO_PASSWORD}`);
}

async function main() {
  await seedMexico();
  await seedPanama();
  await seedFonda();
  await seedInterior();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
