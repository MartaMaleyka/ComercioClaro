import { z } from "zod";

/** Canal para sincronizar el punto de venta con la pantalla del cliente en el mismo equipo. */
export const DISPLAY_CHANNEL = "comercioclaro-display";
/** Si está en "1", el punto de venta también envía el estado al servidor (pantalla en otro equipo). */
export const DISPLAY_REMOTE_KEY = "cc-display-remote";

export const displayStateSchema = z.object({
  status: z.enum(["idle", "cart", "done"]),
  lines: z
    .array(
      z.object({
        name: z.string().max(200),
        quantity: z.number().min(0).max(1_000_000),
        unit: z.string().max(10),
        total: z.number().min(0).max(100_000_000),
        promotion: z.string().max(200).nullable(),
      })
    )
    .max(200),
  subtotal: z.number().min(0),
  discount: z.number().min(0),
  total: z.number().min(0),
  paymentMethod: z.string().max(20),
  customerName: z.string().max(200).nullable(),
  points: z.number().int().nullable(),
  change: z.number().min(0),
  at: z.number(),
});

export type DisplayState = z.infer<typeof displayStateSchema>;

export const IDLE_STATE: DisplayState = {
  status: "idle",
  lines: [],
  subtotal: 0,
  discount: 0,
  total: 0,
  paymentMethod: "CASH",
  customerName: null,
  points: null,
  change: 0,
  at: 0,
};
