import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("demo123", 12);

  const user = await prisma.user.upsert({
    where: { email: "demo@comercioclaro.com" },
    update: {},
    create: {
      email: "demo@comercioclaro.com",
      passwordHash,
      name: "María García",
      business: {
        create: {
          name: "Miscelánea La Esperanza",
          description: "Tu tienda de confianza en el barrio",
          phone: "55 1234 5678",
          address: "Av. Principal #123, Col. Centro",
        },
      },
    },
    include: { business: true },
  });

  const businessId = user.business!.id;

  const products = await Promise.all([
    prisma.product.upsert({
      where: { id: "seed-coca" },
      update: {},
      create: {
        id: "seed-coca",
        name: "Coca-Cola 600ml",
        description: "Refresco de cola",
        price: 18,
        cost: 12,
        stock: 48,
        minStock: 12,
        businessId,
      },
    }),
    prisma.product.upsert({
      where: { id: "seed-sabritas" },
      update: {},
      create: {
        id: "seed-sabritas",
        name: "Sabritas Original 45g",
        description: "Papas fritas",
        price: 15,
        cost: 9,
        stock: 30,
        minStock: 10,
        businessId,
      },
    }),
    prisma.product.upsert({
      where: { id: "seed-agua" },
      update: {},
      create: {
        id: "seed-agua",
        name: "Agua Bonafont 1L",
        description: "Agua purificada",
        price: 12,
        cost: 7,
        stock: 3,
        minStock: 10,
        businessId,
      },
    }),
    prisma.product.upsert({
      where: { id: "seed-pan" },
      update: {},
      create: {
        id: "seed-pan",
        name: "Pan Bimbo Grande",
        description: "Pan de caja blanco",
        price: 42,
        cost: 32,
        stock: 8,
        minStock: 5,
        businessId,
      },
    }),
    prisma.product.upsert({
      where: { id: "seed-leche" },
      update: {},
      create: {
        id: "seed-leche",
        name: "Leche Lala 1L",
        description: "Leche entera",
        price: 28,
        cost: 22,
        stock: 15,
        minStock: 6,
        businessId,
      },
    }),
  ]);

  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);

    await prisma.sale.create({
      data: {
        total: products[0].price * 2 + products[1].price,
        businessId,
        createdAt: date,
        items: {
          create: [
            {
              productId: products[0].id,
              quantity: 2,
              unitPrice: products[0].price,
              subtotal: products[0].price * 2,
            },
            {
              productId: products[1].id,
              quantity: 1,
              unitPrice: products[1].price,
              subtotal: products[1].price,
            },
          ],
        },
      },
    });
  }

  console.log("✅ Datos de demostración creados");
  console.log("   Correo: demo@comercioclaro.com");
  console.log("   Contraseña: demo123");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
