import { handler } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { downloadInvoice } from "@/server/invoices";

export const GET = handler<{ id: string }>(async (request, { params }) => {
  const auth = await requireAuth("OWNER");
  const { id } = await params;
  const format = request.nextUrl.searchParams.get("format") === "xml" ? "xml" : "pdf";
  const { invoice, content } = await downloadInvoice(auth.businessId, id, format);
  return new Response(new Uint8Array(content), {
    headers: {
      "Content-Type": format === "pdf" ? "application/pdf" : "application/xml",
      "Content-Disposition": `attachment; filename="factura-${invoice.uuid ?? invoice.id}.${format}"`,
    },
  });
});
