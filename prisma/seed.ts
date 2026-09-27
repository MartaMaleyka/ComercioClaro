import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/auth";
import { createProduct } from "../src/server/catalog";
import { TERMS_VERSION } from "../src/lib/business-types";
import { DEMO_ADMIN_TOTP_SECRET, sealSecret } from "../src/lib/totp";
import { getJwtSecret } from "../src/lib/env";
import { createPurchase } from "../src/server/purchases";
import { createSale } from "../src/server/sales";
import { addCustomerPayment } from "../src/server/customers";
import { openCashSession } from "../src/server/cash";
import { syncDeliveryZones } from "../src/server/delivery";
import { FEATURE_KEYS, type FeatureKey } from "../src/lib/features";
import { saveRecipe } from "../src/server/recipes";
import { adjustStock } from "../src/server/inventory";
import { createSupplierBill, paySupplierBill } from "../src/server/payables";
import { createRecurringExpense } from "../src/server/cashflow";
import { closePeriod, createOwnerTransaction } from "../src/server/accounting";
import { createAdvance, createEmployee, createPayrollRun, payPayrollRun } from "../src/server/payroll";
import { createCampaign, markRecipientSent, saveCoupon } from "../src/server/campaigns";
import { addDays, dayKey } from "../src/lib/dates";
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

/**
 * Cuentas de demostración de Panamá de versiones anteriores. Sus negocios se integran a las
 * cuentas Dueño y Cajero; los usuarios y sus datos se conservan.
 */
const LEGACY_DEMO_ACCOUNTS = [
  "demo.pa@comercioclaro.com",
  "cajero.pa@comercioclaro.com",
  "demo.fonda@comercioclaro.com",
  "demo.interior@comercioclaro.com",
];

/** Dueño y cajero de demostración: tienen acceso a todos los negocios de ejemplo. */
async function demoUsers() {
  const [owner, cashier] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { email: DEMO_EMAIL } }),
    prisma.user.findUniqueOrThrow({ where: { email: CASHIER_EMAIL } }),
  ]);
  return { owner, cashier };
}

async function hasDemoBusiness(ownerId: string, name: string) {
  const found = await prisma.business.findFirst({ where: { name, memberships: { some: { userId: ownerId } } } });
  return found !== null;
}

/** Da acceso al dueño y al cajero de demostración a los negocios de las cuentas anteriores. */
async function integrateLegacyDemoAccounts() {
  const { owner, cashier } = await demoUsers();
  const legacy = await prisma.membership.findMany({
    where: { user: { email: { in: LEGACY_DEMO_ACCOUNTS } } },
    select: { businessId: true },
  });
  const businessIds = [...new Set(legacy.map((m) => m.businessId))];
  for (const businessId of businessIds) {
    for (const [userId, role] of [
      [owner.id, "OWNER"],
      [cashier.id, "CASHIER"],
    ] as const) {
      await prisma.membership.upsert({
        where: { userId_businessId: { userId, businessId } },
        create: { userId, businessId, role },
        update: {},
      });
    }
  }
  if (businessIds.length > 0) {
    console.log(`✅ ${businessIds.length} negocio(s) de las cuentas anteriores integrados a Dueño y Cajero`);
  }
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

/** Minisúper panameño: ITBMS 0/7/10/15%, B/., Yappy, fiado a 15 días y facturador gratuito. */
async function seedPanama() {
  const { owner, cashier } = await demoUsers();
  if (await hasDemoBusiness(owner.id, "Minisúper El Dorado")) {
    console.log("ℹ️  La demostración de Panamá ya existe; no se modificó.");
    return;
  }
  const { id: businessId } = await prisma.business.create({
    data: {
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
      memberships: {
        create: [
          { userId: owner.id, role: "OWNER" },
          { userId: cashier.id, role: "CASHIER" },
        ],
      },
    },
  });
  const actor = { userId: owner.id, businessId, role: "OWNER" as const };

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
  console.log("   Catálogo público: /c/minisuper-el-dorado");
}

/** Fonda panameña en modo restaurante: cuentas por mesa, cocina, extras y variantes. */
async function seedFonda() {
  const { owner, cashier } = await demoUsers();
  if (await hasDemoBusiness(owner.id, "Fonda La Chiricana")) {
    console.log("ℹ️  La demostración de la fonda ya existe; no se modificó.");
    return;
  }
  const { id: businessId } = await prisma.business.create({
    data: {
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
      memberships: {
        create: [
          { userId: owner.id, role: "OWNER" },
          { userId: cashier.id, role: "CASHIER" },
        ],
      },
    },
  });
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
}

/** Abarrotería del interior: venta por libra, fiado a la quincena y a la cosecha, y efectivo. */
async function seedInterior() {
  const { owner, cashier } = await demoUsers();
  if (await hasDemoBusiness(owner.id, "Abarrotería Los Santos")) {
    console.log("ℹ️  La demostración del interior ya existe; no se modificó.");
    return;
  }
  const { id: businessId } = await prisma.business.create({
    data: {
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
      memberships: {
        create: [
          { userId: owner.id, role: "OWNER" },
          { userId: cashier.id, role: "CASHIER" },
        ],
      },
    },
  });
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
}

const ADMIN_EMAIL = "admin@comercioclaro.com";

/** Planes de ejemplo (en dólares, para Panamá). El super admin los cambia en /admin/planes. */
const PLANS = [
  {
    code: "basico",
    name: "Básico",
    description: "Para el kiosco o la abarrotería que empieza.",
    priceMonthly: 9.99,
    priceYearly: 99,
    maxUsers: 2,
    maxBranches: 1,
    maxProducts: 500,
    features: ["promotions", "export"],
    sortOrder: 1,
  },
  {
    code: "pro",
    name: "Pro",
    description: "Minisúper con catálogo en línea, Yappy automático y vales.",
    priceMonthly: 19.99,
    priceYearly: 199,
    maxUsers: 5,
    maxBranches: 2,
    maxProducts: null,
    features: [
      "promotions",
      "loyalty",
      "catalog",
      "yappyApi",
      "customerDisplay",
      "giftCards",
      "services",
      "purchaseOrders",
      "advancedReports",
      "variants",
      "inventoryCounts",
      "export",
      "cashflow",
      "campaigns",
    ],
    isDefault: true,
    sortOrder: 2,
  },
  {
    code: "empresarial",
    name: "Empresarial",
    description: "Varias sucursales, restaurante, factura electrónica y conciliación.",
    priceMonthly: 39.99,
    priceYearly: 399,
    maxUsers: null,
    maxBranches: null,
    maxProducts: null,
    features: FEATURE_KEYS,
    sortOrder: 3,
  },
];

/**
 * Funciones que se agregaron después de crear los planes: al volver a correr el seed se suman
 * a los planes existentes (sin quitar lo que el super admin haya cambiado).
 */
const PLAN_ADDITIONS: Record<string, FeatureKey[]> = {
  basico: ["payables", "splitPayments", "scale"],
  pro: ["payables", "splitPayments", "scale", "cashflow", "campaigns"],
  empresarial: ["payables", "splitPayments", "scale", "recipes", "cashflow", "accounting", "payroll", "campaigns"],
};

/** Planes, super admin y la suscripción de cada negocio de demostración. */
async function seedPlatform() {
  const plans: Record<string, string> = {};
  for (const plan of PLANS) {
    const { code, ...data } = plan;
    const saved = await prisma.plan.upsert({
      where: { code },
      create: { code, ...data, features: [...data.features] },
      update: {},
    });
    plans[code] = saved.id;
    const missing = (PLAN_ADDITIONS[code] ?? []).filter((f) => !saved.features.includes(f));
    if (missing.length > 0) {
      await prisma.plan.update({ where: { id: saved.id }, data: { features: [...saved.features, ...missing] } });
    }
  }

  if (!(await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } }))) {
    await prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        name: "Administración ComercioClaro",
        passwordHash: await hashPassword(DEMO_PASSWORD),
        isSuperAdmin: true,
      },
    });
  }
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });

  const day = 24 * 60 * 60 * 1000;
  const subscriptions = [
    { name: "Miscelánea La Esperanza", plan: "pro", status: "ACTIVE" as const, days: 25, price: 19.99 },
    { name: "Minisúper El Dorado", plan: "empresarial", status: "ACTIVE" as const, days: 20, price: 39.99 },
    { name: "Fonda La Chiricana", plan: "empresarial", status: "ACTIVE" as const, days: 12, price: 39.99 },
    { name: "Abarrotería Los Santos", plan: "basico", status: "TRIAL" as const, days: 10, price: 0 },
  ];
  const { owner } = await demoUsers();
  for (const sub of subscriptions) {
    const business = await prisma.business.findFirst({
      where: { name: sub.name, planId: null, memberships: { some: { userId: owner.id } } },
    });
    // Solo se asigna una vez: después lo administra el super admin.
    if (!business) continue;
    const until = new Date(Date.now() + sub.days * day);
    await prisma.business.update({
      where: { id: business.id },
      data: {
        planId: plans[sub.plan],
        status: sub.status,
        ...(sub.status === "TRIAL" ? { trialEndsAt: until } : { paidUntil: until }),
      },
    });
    if (sub.price > 0) {
      const start = new Date(until);
      start.setUTCMonth(start.getUTCMonth() - 1);
      await prisma.subscriptionPayment.create({
        data: {
          businessId: business.id,
          planId: plans[sub.plan],
          amount: sub.price,
          method: "YAPPY",
          reference: `DEMO-${business.id.slice(-6).toUpperCase()}`,
          periodStart: start,
          periodEnd: until,
          createdById: admin.id,
        },
      });
    }
  }
  console.log("✅ Planes y administración de la plataforma");
  console.log(`   Super admin: ${ADMIN_EMAIL} / ${DEMO_PASSWORD} (panel en /admin)`);
}

/** Negocio de demostración del dueño y su actor (para las demostraciones que se agregan después). */
async function demoBusiness(name: string) {
  const { owner } = await demoUsers();
  const business = await prisma.business.findFirst({ where: { name, memberships: { some: { userId: owner.id } } } });
  return business ? { business, actor: { userId: owner.id, businessId: business.id, role: "OWNER" as const } } : null;
}

/** Recetas de la fonda: insumos por libra y lo que lleva cada plato. */
async function seedRecipes() {
  const demo = await demoBusiness("Fonda La Chiricana");
  if (!demo) return;
  const { business, actor } = demo;
  if (await prisma.product.findFirst({ where: { businessId: business.id, isIngredient: true } })) return;
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
    satUnitKey: "LBR",
    categoryId: null,
    taxRate: 0,
    price: 0,
    isIngredient: true,
  };
  const ingredient = async (name: string, unit: "LB" | "PIECE", cost: number, stock: number, minStock: number) =>
    (await createProduct(actor, { ...base, name, unit, cost, stock, minStock })).id;
  const chicken = await ingredient("Pollo (insumo)", "LB", 1.6, 40, 10);
  const yam = await ingredient("Ñame", "LB", 0.9, 25, 8);
  const rice = await ingredient("Arroz (insumo)", "LB", 0.55, 50, 15);
  const cilantro = await ingredient("Culantro (mazo)", "PIECE", 0.35, 12, 4);
  const dishes = await prisma.product.findMany({
    where: { businessId: business.id, name: { in: ["Sancocho", "Pollo guisado con arroz"] } },
  });
  const byName = new Map(dishes.map((d) => [d.name, d.id]));
  // Olla de sancocho: rinde 10 platos.
  if (byName.has("Sancocho")) {
    await saveRecipe(actor, byName.get("Sancocho")!, {
      recipeYield: 10,
      items: [
        { ingredientId: chicken, quantity: 5 },
        { ingredientId: yam, quantity: 4 },
        { ingredientId: cilantro, quantity: 2 },
      ],
    });
  }
  if (byName.has("Pollo guisado con arroz")) {
    await saveRecipe(actor, byName.get("Pollo guisado con arroz")!, {
      recipeYield: null,
      items: [
        { ingredientId: chicken, quantity: 0.5 },
        { ingredientId: rice, quantity: 0.4 },
      ],
    });
  }
  await adjustStock(actor, cilantro, { mode: "delta", quantity: -2, reason: "WASTE", notes: "Se marchitó" });
  console.log("✅ Recetas e insumos de la fonda");
}

/** Cuentas por pagar del minisúper: una compra a crédito, una factura vencida y una que vence esta semana. */
async function seedPayables() {
  const demo = await demoBusiness("Minisúper El Dorado");
  if (!demo) return;
  const { business, actor } = demo;
  if (await prisma.supplierBill.findFirst({ where: { businessId: business.id } })) return;
  const [beer, groceries] = await Promise.all([
    prisma.supplier.findFirst({ where: { businessId: business.id, name: { startsWith: "Distribuidora Cervecería" } } }),
    prisma.supplier.findFirst({ where: { businessId: business.id, name: { startsWith: "Abarrotes Mayoristas" } } }),
  ]);
  if (!beer || !groceries) return;
  await prisma.supplier.update({ where: { id: groceries.id }, data: { creditDays: 15 } });
  const products = await prisma.product.findMany({
    where: { businessId: business.id, archivedAt: null, trackStock: true, isIngredient: false },
    orderBy: { name: "asc" },
    take: 2,
  });
  await createPurchase(actor, {
    supplierId: groceries.id,
    supplierName: null,
    notes: "Pedido quincenal",
    paidFromCash: false,
    onCredit: true,
    invoiceNumber: "AMI-2031",
    items: products.map((p) => ({ productId: p.id, quantity: 12, unitCost: Number(p.cost), lotCode: null, expiresAt: null })),
  });
  const today = dayKey(new Date(), business.timezone);
  const overdue = await createSupplierBill(actor, {
    supplierId: beer.id,
    number: "CN-88412",
    date: addDays(today, -40),
    dueDate: addDays(today, -10),
    total: 186.4,
    tax: 12.19,
    notes: "Cerveza y maltas",
  });
  await paySupplierBill(actor, overdue.id, { amount: 80, method: "TRANSFER", fromCash: false, reference: "ACH-5521" });
  await createSupplierBill(actor, {
    supplierId: beer.id,
    number: "CN-88977",
    date: addDays(today, -25),
    dueDate: addDays(today, 4),
    total: 94.5,
    tax: 6.18,
  });
  console.log("✅ Cuentas por pagar del minisúper");
}

/** Una venta del minisúper cobrada con tarjeta y efectivo (pago dividido). */
async function seedSplitPayments() {
  const demo = await demoBusiness("Minisúper El Dorado");
  if (!demo) return;
  const { business, actor } = demo;
  if (await prisma.sale.findFirst({ where: { businessId: business.id, paymentMethod: "MIXED" } })) return;
  const product = await prisma.product.findFirst({
    where: { businessId: business.id, archivedAt: null, trackStock: true, isIngredient: false, stock: { gte: 3 } },
    orderBy: { name: "asc" },
  });
  if (!product) return;
  const total = Number(product.price) * 3;
  const card = Math.round(total * 50) / 100;
  await createSale(actor, {
    items: [{ productId: product.id, quantity: 3, discount: 0 }],
    discount: 0,
    paymentMethod: "CARD",
    payments: [
      { method: "CARD", amount: card, reference: "VISA-4411" },
      { method: "CASH", amount: Math.ceil(total - card) },
    ],
    notes: "Pagó una parte con tarjeta y el resto en efectivo",
    senior: false,
  });
  console.log("✅ Venta con pago dividido");
}

/** Gastos fijos del minisúper para el flujo de caja y el punto de equilibrio. */
async function seedRecurringExpenses() {
  const demo = await demoBusiness("Minisúper El Dorado");
  if (!demo) return;
  if (await prisma.recurringExpense.findFirst({ where: { businessId: demo.business.id } })) return;
  const fixed = [
    { category: "Renta", amount: 650, dayOfMonth: 1, description: "Local en El Dorado" },
    { category: "Luz", amount: 180, dayOfMonth: 12, description: "Naturgy" },
    { category: "Internet / teléfono", amount: 45, dayOfMonth: 20, description: null },
  ];
  for (const f of fixed) {
    await createRecurringExpense(demo.actor, { ...f, paymentMethod: "TRANSFER", active: true });
  }
  console.log("✅ Gastos recurrentes del minisúper");
}

/** Contabilidad del minisúper: capital inicial, un retiro del dueño y el mes de hace dos meses cerrado. */
async function seedAccounting() {
  const demo = await demoBusiness("Minisúper El Dorado");
  if (!demo) return;
  const { business, actor } = demo;
  if (await prisma.ownerTransaction.findFirst({ where: { businessId: business.id } })) return;
  const day = 24 * 60 * 60 * 1000;
  await createOwnerTransaction(actor, {
    type: "CONTRIBUTION",
    amount: 2500,
    method: "TRANSFER",
    date: new Date(Date.now() - 45 * day),
    notes: "Capital para abrir el minisúper",
  });
  await createOwnerTransaction(actor, {
    type: "WITHDRAWAL",
    amount: 150,
    method: "TRANSFER",
    date: new Date(Date.now() - 2 * day),
    notes: "Gastos de la casa",
  });
  const twoMonthsAgo = dayKey(new Date(Date.now() - 62 * day), business.timezone).slice(0, 7);
  await closePeriod({ ...actor, timezone: business.timezone }, twoMonthsAgo);
  console.log("✅ Contabilidad del minisúper (aportes, retiros y cierre de mes)");
}

/** Planilla de la fonda: dos empleados, la quincena anterior pagada y un adelanto por descontar. */
async function seedPayroll() {
  const demo = await demoBusiness("Fonda La Chiricana");
  if (!demo) return;
  const { business, actor } = demo;
  if (await prisma.employee.findFirst({ where: { businessId: business.id } })) return;
  const day = 24 * 60 * 60 * 1000;
  const key = (msAgo: number) => dayKey(new Date(Date.now() - msAgo), business.timezone);
  await createEmployee(actor, {
    name: "Yaritza Pérez",
    idNumber: "4-712-1180",
    socialSecurityNumber: "2211987",
    position: "Cocinera",
    salary: 750,
    frequency: "QUINCENAL",
    hireDate: key(730 * day),
    vacationSince: key(200 * day),
    active: true,
  });
  const waiter = await createEmployee(actor, {
    name: "Luis Batista",
    idNumber: "8-955-2034",
    socialSecurityNumber: "3310452",
    position: "Mesero",
    salary: 650,
    frequency: "QUINCENAL",
    hireDate: key(240 * day),
    vacationSince: null,
    active: true,
  });
  // La quincena anterior, ya pagada por transferencia.
  const previous = await createPayrollRun(actor, { frequency: "QUINCENAL", date: key(16 * day) });
  await payPayrollRun(actor, previous.id, "TRANSFER");
  await createAdvance(actor, { employeeId: waiter.id, amount: 40, method: "TRANSFER", notes: "Adelanto por emergencia" });
  console.log("✅ Planilla de la fonda");
}

/** Campañas del minisúper: clientes que aceptaron promociones, un cupón y la campaña de cumpleaños. */
async function seedCampaigns() {
  const demo = await demoBusiness("Minisúper El Dorado");
  if (!demo) return;
  const { business, actor } = demo;
  if (await prisma.coupon.findFirst({ where: { businessId: business.id } })) return;
  const month = dayKey(new Date(), business.timezone).slice(5, 7);
  const customers = await prisma.customer.findMany({ where: { businessId: business.id }, orderBy: { name: "asc" } });
  for (const [i, c] of customers.entries()) {
    await prisma.customer.update({
      where: { id: c.id },
      data: {
        marketingConsent: true,
        consentAt: new Date(),
        phone: c.phone ?? `6555-00${String(i + 10).padStart(2, "0")}`,
        tags: i === 0 ? ["vecina", "frecuente"] : ["vecino"],
        birthday: new Date(`1975-${i === 0 ? month : "01"}-${String(10 + i).padStart(2, "0")}T00:00:00Z`),
      },
    });
  }
  const coupon = await saveCoupon(actor, {
    code: "CUMPLE10",
    kind: "PERCENT",
    value: 0.1,
    minPurchase: 5,
    startsAt: null,
    endsAt: null,
    maxUses: null,
    active: true,
  });
  await saveCoupon(actor, {
    code: "VUELVE2",
    kind: "AMOUNT",
    value: 2,
    minPurchase: 10,
    startsAt: null,
    endsAt: null,
    maxUses: 50,
    active: true,
  });
  const campaign = await createCampaign(
    { ...actor, timezone: business.timezone },
    {
      name: "Cumpleaños del mes",
      message: "¡Feliz cumpleaños, {nombre}! En Minisúper El Dorado te regalamos 10% con el cupón {cupón}. Tienes {puntos} puntos.",
      segment: { type: "BIRTHDAY" },
      couponId: coupon.id,
    }
  );
  const first = await prisma.campaignRecipient.findFirst({ where: { campaignId: campaign.id } });
  if (first) await markRecipientSent(actor, first.id);
  console.log("✅ Campañas y cupones del minisúper");
}

/** Balanza: un producto por libra con código PLU para las etiquetas de peso del minisúper. */
async function seedScale() {
  const demo = await demoBusiness("Minisúper El Dorado");
  if (!demo) return;
  const { business, actor } = demo;
  if (await prisma.product.findFirst({ where: { businessId: business.id, sku: "00406" } })) return;
  await createProduct(actor, {
    name: "Jamón de pierna (libra)",
    description: "Se pesa en la balanza del mostrador; la etiqueta lleva el PLU 00406",
    sku: "00406",
    barcode: null,
    unit: "LB",
    price: 3.5,
    cost: 2.6,
    stock: 30,
    minStock: 5,
    taxRate: 0,
    wholesalePrice: null,
    wholesaleMinQty: null,
    trackExpiry: false,
    packSize: null,
    iepsRate: 0,
    satProductKey: "01010101",
    satUnitKey: "LBR",
    categoryId: null,
  });
}

/** Cobro automático: reglas de la plataforma y una tarjeta de prueba guardada en la fonda. */
async function seedBilling() {
  await prisma.platformSettings.upsert({ where: { id: "platform" }, create: {}, update: {} });
  const demo = await demoBusiness("Fonda La Chiricana");
  if (!demo) return;
  const { business } = demo;
  if (business.billingCustomerId) return;
  await prisma.business.update({
    where: { id: business.id },
    data: {
      autoRenew: true,
      billingCustomerId: `sim_cus_${business.id}`,
      billingMethodId: "sim_pm_4242",
      billingCardLabel: "Tarjeta de prueba •••• 4242",
    },
  });
}

/** Registro: cuentas de demostración confirmadas, términos aceptados y tipo de cada negocio. */
async function seedSignup() {
  const now = new Date();
  await prisma.user.updateMany({
    where: { email: { in: [DEMO_EMAIL, CASHIER_EMAIL, ADMIN_EMAIL] }, emailVerifiedAt: null },
    data: { emailVerifiedAt: now },
  });
  await prisma.user.updateMany({
    where: { email: { in: [DEMO_EMAIL, CASHIER_EMAIL] }, termsAcceptedAt: null },
    data: { termsAcceptedAt: now, termsVersion: TERMS_VERSION },
  });
  const types: Record<string, string> = {
    "Miscelánea La Esperanza": "MINISUPER",
    "Minisúper El Dorado": "MINISUPER",
    "Fonda La Chiricana": "FONDA",
    "Abarrotería Los Santos": "MINISUPER",
  };
  for (const [name, businessType] of Object.entries(types)) {
    await prisma.business.updateMany({
      where: { name, businessType: null },
      data: { businessType, signupSource: "SELF" },
    });
  }
}

/**
 * Seguridad: el super admin de demostración tiene la verificación en dos pasos con una clave fija
 * (DEMO_ADMIN_TOTP_SECRET, documentada en el README) para poder entrar y probar el panel.
 */
async function seedSecurity() {
  const admin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (!admin || admin.totpEnabledAt) return;
  await prisma.user.update({
    where: { id: admin.id },
    data: {
      totpSecret: sealSecret(DEMO_ADMIN_TOTP_SECRET, Buffer.from(getJwtSecret()).toString("utf8")),
      totpEnabledAt: new Date(),
      totpRecoveryHashes: [],
    },
  });
}

async function main() {
  await seedMexico();
  await integrateLegacyDemoAccounts();
  await seedPanama();
  await seedFonda();
  await seedInterior();
  await seedPlatform();
  await seedRecipes();
  await seedPayables();
  await seedSplitPayments();
  await seedRecurringExpenses();
  await seedAccounting();
  await seedPayroll();
  await seedCampaigns();
  await seedScale();
  await seedBilling();
  await seedSignup();
  await seedSecurity();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
