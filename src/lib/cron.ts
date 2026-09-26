import crypto from "crypto";
import type { NextRequest } from "next/server";

/** Valida `Authorization: Bearer $CRON_SECRET` en tiempo constante. */
export function isAuthorizedCron(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return Boolean(
    secret && header.length === expected.length && crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected))
  );
}
