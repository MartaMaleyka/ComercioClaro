/** Acciones de la bitácora del super admin, en palabras. */
export const ACTION_LABELS: Record<string, string> = {
  "business.update": "Cambió la suscripción o las funciones",
  "business.create": "Dio de alta el negocio",
  "business.register": "Se registró un negocio",
  "payment.record": "Registró un pago",
  "support.enter": "Entró como soporte",
  "plan.create": "Creó un plan",
  "plan.update": "Modificó un plan",
  "plan.delete": "Eliminó un plan",
  "user.update": "Cambió el acceso de un usuario",
  "user.revokeSessions": "Cerró las sesiones de un usuario",
  "user.resetPassword": "Generó una contraseña temporal",
  "plan.feature": "Cambió una función de un plan",
  "business.feature": "Ajustó una función de un negocio",
  "billing.settings": "Cambió las reglas del cobro automático",
  "billing.failed": "Cobro automático rechazado",
  "billing.suspend": "Suspendió por falta de pago",
};
