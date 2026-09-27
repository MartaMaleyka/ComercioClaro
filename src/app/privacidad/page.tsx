import type { Metadata } from "next";
import { LegalPage, SUPPORT_EMAIL } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Aviso de privacidad · ComercioClaro" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Aviso de privacidad">
      <p>
        Este aviso explica qué datos personales tratamos, para qué y cuáles son tus derechos, conforme a la Ley 81 de
        2019 de protección de datos personales de Panamá y, en México, a la Ley Federal de Protección de Datos
        Personales en Posesión de los Particulares.
      </p>
      <h2>Qué datos tratamos</h2>
      <ul>
        <li>
          De la cuenta: nombre, correo, teléfono, contraseña (guardada cifrada) y la fecha en que aceptaste estos
          términos.
        </li>
        <li>
          Del negocio: nombre, país, tipo de negocio, datos fiscales y la información que registras (ventas, productos,
          clientes, empleados).
        </li>
        <li>De seguridad: inicios de sesión y acciones importantes, para proteger tu cuenta.</li>
      </ul>
      <h2>Para qué los usamos</h2>
      <ul>
        <li>
          Darte el servicio, cobrar el plan y enviarte avisos de tu cuenta (confirmación de correo, vencimientos,
          seguridad).
        </li>
        <li>
          Soporte técnico: el equipo de la plataforma puede entrar a tu negocio solo para ayudarte, y queda registrado.
        </li>
        <li>No vendemos tus datos ni los de tus clientes.</li>
      </ul>
      <h2>Datos de tus clientes y empleados</h2>
      <p>
        Tu negocio es el responsable de los datos de sus clientes y empleados. Las campañas por WhatsApp solo se envían
        a clientes que aceptaron recibirlas, y se guarda la fecha de su consentimiento.
      </p>
      <h2>Tus derechos</h2>
      <p>
        Puedes pedir el acceso, la rectificación, la cancelación o la oposición al tratamiento de tus datos, y la
        portabilidad, escribiendo a{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-brand-700 dark:text-brand-300 underline">
          {SUPPORT_EMAIL}
        </a>
        .
      </p>
    </LegalPage>
  );
}
