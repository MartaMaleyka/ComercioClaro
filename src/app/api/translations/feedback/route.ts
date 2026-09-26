import { handler, parseBody, created } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { translationFeedbackSchema } from "@/lib/validation";

/** Reportes de traducción de los usuarios (para corregir el chino y el inglés con dueños reales). */
export const GET = handler(async () => {
  const auth = await requireAuth("OWNER");
  return prisma.translationFeedback.findMany({
    where: { businessId: auth.businessId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
});

export const POST = handler(async (request) => {
  const auth = await requireAuth();
  if (auth.user.language === "es") throw new AppError(400, "Los reportes de traducción son para chino e inglés");
  await rateLimit(`translation-feedback:${auth.userId}`, 30, 3600);
  const data = await parseBody(request, translationFeedbackSchema);
  const feedback = await prisma.translationFeedback.create({
    data: { ...data, language: auth.user.language, userId: auth.userId, businessId: auth.businessId },
  });
  return created(feedback);
});
