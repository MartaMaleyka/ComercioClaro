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

export function clientIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}
