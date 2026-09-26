import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { COOKIE_NAME, verifyToken } from "@/lib/session-token";

const publicPages = ["/", "/login", "/registro", "/recuperar-contrasena", "/offline"];
const publicApi = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/reset-password",
  "/api/auth/logout",
  "/api/cron/",
];

/**
 * Primera barrera: redirige a /login si no hay sesión con firma válida.
 * Cada route handler vuelve a validar la sesión contra la base de datos
 * (versión de token, membresía y rol), así que esto no es la única defensa.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");
  const isPublic = isApi
    ? publicApi.some((p) => pathname === p || (p.endsWith("/") && pathname.startsWith(p)))
    : publicPages.includes(pathname);

  const token = request.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifyToken(token) : null;

  if (!isPublic && !session) {
    if (isApi) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (session && (pathname === "/login" || pathname === "/registro")) {
    return NextResponse.redirect(new URL("/inicio", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js).*)"],
};
