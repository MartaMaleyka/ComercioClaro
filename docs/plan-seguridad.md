# Seguridad de las cuentas

Tercer PR del plan de registro, control y seguridad.

## Página Seguridad (`/seguridad`)

La usa cualquier usuario con sesión, con o sin negocio (el super admin también). Se llega desde *Configuración → Mi cuenta → Abrir seguridad* o desde el encabezado del panel.

- **Verificación en dos pasos (TOTP):**
  - **Activar:** se muestra un código QR y la clave para escribir a mano. Se confirma con el primer código de 6 dígitos. Sirve cualquier app: Google Authenticator, Microsoft Authenticator, Authy, 1Password…
  - Al activarla se entregan **10 códigos de recuperación** de un solo uso para copiar o descargar. Se muestran una sola vez y se guardan como hash.
  - Se pueden generar códigos nuevos (con un código de la app) o desactivarla (con la contraseña y un código). No se puede desactivar si es obligatoria.
  - Llega un correo al activarla.
- **Sesiones abiertas:** cada dispositivo con su navegador, IP y última actividad, con "Este dispositivo" marcado. Se puede **cerrar una sesión** o **cerrar las demás**.
- **Actividad reciente:** los últimos 20 inicios de sesión, correctos y fallidos, con el motivo.
- **Contraseña:** enlace para cambiarla (cierra las sesiones de los demás dispositivos).

## Inicio de sesión

1. Correo y contraseña, con los límites de intentos que ya había.
2. Si la cuenta tiene los dos pasos, la contraseña sola no abre la sesión:
   - Se pide el código de la app o uno de recuperación.
   - El reto dura 5 minutos, va en una cookie aparte y admite 6 intentos cada 15 minutos.
3. Cada intento queda en el historial (`LoginEvent`) con su resultado: correcto, contraseña incorrecta, correo desconocido, usuario bloqueado, faltó el código o código incorrecto.
4. Si se entra desde un **dispositivo nuevo** (un navegador que no se había usado con esa cuenta), llega un correo con el dispositivo, la IP, la hora y un enlace a Seguridad.

## Sesiones en el servidor

- Cada inicio de sesión crea una `UserSession`, y el token de la cookie lleva su id.
- En cada petición se comprueba que la sesión no esté cerrada ni vencida, y se actualiza la última actividad cada 5 minutos.
- Cambiar de negocio, entrar como soporte o cambiar la contraseña conservan la sesión del dispositivo.
- Al cerrar sesión, esa sesión queda cerrada en el servidor: el token ya no sirve aunque alguien lo haya copiado.
- *Cerrar sesión en todos los dispositivos* y el cambio de contraseña invalidan todas las demás.
- Los tokens emitidos antes de este cambio (sin id) siguen valiendo hasta que vencen.

## Obligatoria

- **Super admin:**
  - El panel exige la verificación en dos pasos. Sin ella, se le manda a Seguridad a activarla y la API del panel responde 403.
  - `ADMIN_MFA_REQUIRED=false` lo apaga, solo para desarrollo.
  - Al desplegar, los super admin que no la tengan la activan en su siguiente entrada.
- **Por negocio:**
  - En la ficha del negocio, *Usuarios del negocio → Exigir verificación en dos pasos*, con el conteo de cuántos ya la usan.
  - Quien no la tenga es enviado a Seguridad al entrar, y la API responde 403 hasta que la active.
- **Dueños y cajeros:** es opcional (lo que se acordó), salvo que su negocio la exija.

## Contraseñas

- Se mantiene el mínimo de 8 caracteres.
- Se rechazan las más usadas (12345678, password, contraseña, comercioclaro…) y las series (aaaaaaaa, 23456789).
- Aplica al registrarse, al recuperar la contraseña y al cambiarla. El registro avisa mientras se escribe.

## IP detrás de un proxy

Los límites de intentos y el historial usan la IP que agregó el **último proxy de confianza** en `x-forwarded-for`, no la primera, que el cliente puede inventar. `TRUSTED_PROXY_HOPS` indica cuántos proxys hay (por defecto 1, como en Vercel o detrás de un solo nginx).

## Super admin → Usuarios

- **Datos:** último acceso, si usa los dos pasos (y un aviso si es administrador y no los usa) y si confirmó el correo.
- **Filtros:** administradores, sin dos pasos, correo sin confirmar y bloqueados.
- **Actividad:** sus negocios con el rol, sus sesiones abiertas (se cierran una por una) y sus últimos 30 inicios de sesión con dispositivo e IP.
- **Cambiar correo:**
  - El correo nuevo queda sin confirmar y recibe el enlace.
  - Se cierran sus sesiones y se avisa al correo anterior.
- **Quitar dos pasos,** para quien perdió el teléfono (con confirmación): se cierran sus sesiones y se le avisa por correo.
- Todo queda en la bitácora del panel.

## Datos

Migración aditiva `20260930130000_seguridad`:

- **`User`:** `totpSecret`, cifrado con AES-256-GCM y una llave derivada de `JWT_SECRET`; `totpEnabledAt` y `totpRecoveryHashes`.
- **`Business.requireMfa`.**
- **Tablas nuevas:** `UserSession` y `LoginEvent`.

La implementación TOTP (RFC 6238) no agrega dependencias. El código QR usa `qrcode`, que ya estaba en el proyecto.

## Demostración

El super admin de demostración (`admin@comercioclaro.com` / `demo1234`) tiene los dos pasos activos con la clave fija `JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP` (`DEMO_ADMIN_TOTP_SECRET`). Agrégala a tu app de autenticación para entrar al panel. Las pruebas e2e calculan el código con esa clave.

## Pruebas

- **Unitarias** (`tests/unit/seguridad.test.ts`):
  - Vectores del RFC 6238.
  - Ventana de ±30 s.
  - Base32 y la dirección otpauth.
  - Cifrado de la clave (otro secreto o datos alterados fallan).
  - Códigos de recuperación.
  - Contraseñas comunes.
  - IP con uno y dos proxys.
- **Integración** (`tests/integration/seguridad.test.ts`, 7 pruebas):
  - Activar, validar, códigos de recuperación de un solo uso y regenerarlos.
  - Desactivar con contraseña y código, y no poder si es obligatoria.
  - Negocio que la exige.
  - Super admin sin dos pasos.
  - Sesiones: cerrar una o las demás, y aviso de dispositivo nuevo.
  - Reto e historial.
  - Cambiar el correo y quitar los dos pasos desde el panel.
- **E2E** (`e2e/seguridad.spec.ts`):
  - Activar desde la página y entrar con un código de recuperación (un código equivocado no entra).
  - Cerrar las sesiones de otro dispositivo, que queda con 401.
  - Negocio que la exige: redirección y 403 hasta activarla.
  - Filtros y actividad en Usuarios.
  - axe en Seguridad, el QR y el paso del código, en modo claro y oscuro.
- `loginAdmin` de las e2e ahora completa el segundo paso.
