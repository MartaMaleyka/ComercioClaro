/**
 * Envío de mensajes de WhatsApp. Sin configuración el envío es asistido (el dueño abre cada
 * enlace de WhatsApp y marca "enviado"). Con WHATSAPP_PROVIDER=cloud se usa la API de
 * WhatsApp Business (Meta Cloud API); con "simulado" se simula el envío para pruebas.
 */

export interface WhatsappProvider {
  name: string;
  send(to: string, body: string): Promise<{ ok: true; id: string } | { ok: false; error: string }>;
}

const COUNTRY_CODES: Record<string, string> = { PA: "507", MX: "52" };

/** Número en formato internacional (solo dígitos); agrega el código del país a los locales. */
export function internationalNumber(phone: string, country: string) {
  const digits = phone.replace(/\D/g, "");
  const code = COUNTRY_CODES[country];
  if (!code) return digits;
  return digits.length <= 10 && !digits.startsWith(code) ? `${code}${digits}` : digits;
}

function cloudProvider(): WhatsappProvider | null {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return null;
  return {
    name: "cloud",
    async send(to, body) {
      try {
        const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } }),
          signal: AbortSignal.timeout(15_000),
        });
        const data = (await res.json().catch(() => null)) as {
          messages?: { id: string }[];
          error?: { message?: string };
        } | null;
        if (!res.ok || !data?.messages?.[0]) return { ok: false, error: data?.error?.message ?? `HTTP ${res.status}` };
        return { ok: true, id: data.messages[0].id };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Error de red" };
      }
    },
  };
}

const simulated: WhatsappProvider = {
  name: "simulado",
  async send(to) {
    // Los números que terminan en 0000 fallan, para probar los errores.
    return to.endsWith("0000")
      ? { ok: false, error: "Número no disponible en WhatsApp" }
      : { ok: true, id: `sim-${to}` };
  },
};

export function getWhatsappProvider(): WhatsappProvider | null {
  const provider = process.env.WHATSAPP_PROVIDER;
  if (provider === "simulado") return simulated;
  if (provider === "cloud") return cloudProvider();
  return null;
}
