import type { Metadata } from "next";
import { LegalPage, SUPPORT_EMAIL } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Términos de uso · ComercioClaro" };

export default function TermsPage() {
  return (
    <LegalPage title="Términos de uso">
      <p>
        Estos términos rigen el uso de ComercioClaro, el sistema de punto de venta, inventario y administración para
        comercios. Al crear una cuenta los aceptas en nombre de tu negocio.
      </p>
      <h2>La cuenta</h2>
      <ul>
        <li>Los datos que registras deben ser verdaderos; el correo debe ser tuyo y estar confirmado.</li>
        <li>Eres responsable de tu contraseña y de los usuarios que invites (cajeros y dueños).</li>
        <li>Avísanos de inmediato si crees que alguien entró a tu cuenta sin permiso.</li>
      </ul>
      <h2>Planes, prueba y pagos</h2>
      <ul>
        <li>Cada plan incluye las funciones y límites que se muestran en la página de precios.</li>
        <li>
          Al terminar la prueba, o si un pago vence y pasan los días de gracia, el negocio puede suspenderse. Tus datos
          se conservan y se reactiva al pagar.
        </li>
        <li>
          Si activas la renovación automática, cobraremos el plan con tu tarjeta al vencer; puedes cancelarla en Mi
          plan.
        </li>
      </ul>
      <h2>Uso permitido</h2>
      <ul>
        <li>
          No uses la plataforma para actividades ilegales ni para enviar mensajes a clientes que no dieron su
          consentimiento.
        </li>
        <li>
          Las facturas, impuestos y planillas que generes son responsabilidad de tu negocio; verifica los valores con tu
          contador.
        </li>
      </ul>
      <h2>Tus datos</h2>
      <p>
        Los datos de tu negocio son tuyos. Puedes exportarlos cuando quieras. El tratamiento de datos personales se
        describe en el{" "}
        <a href="/privacidad" className="text-brand-700 dark:text-brand-300 underline">
          aviso de privacidad
        </a>
        .
      </p>
      <h2>Contacto</h2>
      <p>
        Escríbenos a{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-brand-700 dark:text-brand-300 underline">
          {SUPPORT_EMAIL}
        </a>
        .
      </p>
    </LegalPage>
  );
}
