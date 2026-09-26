interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Envía correo con Resend (https://resend.com) si RESEND_API_KEY está configurada.
 * En desarrollo, sin clave, el mensaje se imprime en consola.
 */
export async function sendEmail(message: EmailMessage): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[email] Para: ${message.to}\nAsunto: ${message.subject}\n\n${message.text}`);
    } else {
      console.warn("[email] RESEND_API_KEY no configurada; no se envió el correo.");
    }
    return false;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || "ComercioClaro <no-reply@comercioclaro.app>",
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
  });
  if (!res.ok) {
    console.error("[email] Error al enviar", res.status, await res.text().catch(() => ""));
    return false;
  }
  return true;
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
