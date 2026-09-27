import { NextRequest, NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "./errors";
import { serialize } from "./decimal";

type RouteContext<P> = { params: Promise<P> };

/**
 * Envuelve un route handler: convierte errores conocidos en respuestas con mensajes
 * seguros y serializa Decimal/Date. Los errores inesperados se registran y se
 * responden con un mensaje genérico.
 */
export function handler<P = Record<string, string>>(
  fn: (request: NextRequest, context: RouteContext<P>) => Promise<unknown>
) {
  return async (request: NextRequest, context: RouteContext<P>) => {
    try {
      const result = await fn(request, context);
      if (result instanceof Response) return result;
      return NextResponse.json(serialize(result));
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown) {
  if (err instanceof AppError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    const field = issue?.path.length ? `${issue.path.join(".")}: ` : "";
    return NextResponse.json({ error: `${field}${issue?.message ?? "Datos inválidos"}` }, { status: 400 });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return NextResponse.json({ error: "Ya existe un registro con esos datos" }, { status: 409 });
    }
    if (err.code === "P2025") {
      return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });
    }
  }
  if (err instanceof SyntaxError) {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }
  console.error(err);
  return NextResponse.json({ error: "Ocurrió un error inesperado" }, { status: 500 });
}

export function created(data: unknown) {
  return NextResponse.json(serialize(data), { status: 201 });
}

export async function parseBody<T>(request: NextRequest, schema: ZodType<T>): Promise<T> {
  const body = await request.json();
  return schema.parse(body);
}

export function parseQuery<T>(request: NextRequest, schema: ZodType<T>): T {
  return schema.parse(Object.fromEntries(request.nextUrl.searchParams));
}

/**
 * IP del cliente para los límites de intentos y el historial de inicios de sesión.
 * Cada proxy agrega la IP que vio al final de `x-forwarded-for`; las primeras las puede inventar el
 * cliente. Se toma la que puso el último proxy de confianza: TRUSTED_PROXY_HOPS (por defecto 1,
 * como en Vercel o detrás de un solo nginx).
 */
export function clientIp(request: Pick<NextRequest, "headers">) {
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((ip) => ip.trim())
    .filter(Boolean);
  if (forwarded && forwarded.length > 0) {
    const hops = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS) || 1);
    return forwarded[Math.max(0, forwarded.length - hops)];
  }
  return request.headers.get("x-real-ip") || "unknown";
}

/** IP y navegador del dispositivo (para sesiones e historial). */
export function requestMeta(request: Pick<NextRequest, "headers">) {
  return { ip: clientIp(request), userAgent: request.headers.get("user-agent") };
}
