/**
 * Carga masiva: qué columnas acepta cada tipo de registro, cómo se leen las celdas que vienen de
 * Excel (montos con símbolo, "sí/no", fechas dd/mm/aaaa) y cómo se valida cada fila.
 * Se usa igual en el navegador (vista previa) y en el servidor (que es quien decide).
 */
import type { z } from "zod";
import { parseCsv } from "./csv";
import {
  categorySchema,
  customerSchema,
  employeeSchema,
  expenseSchema,
  productCreateSchema,
  supplierSchema,
} from "./validation";

export const BULK_ENTITIES = ["products", "categories", "customers", "suppliers", "expenses", "employees"] as const;
export type BulkEntity = (typeof BULK_ENTITIES)[number];

/** Máximo de filas por carga (el servidor valida y guarda fila por fila). */
export const BULK_MAX_ROWS = 2000;

export interface BulkColumn {
  key: string;
  /** Encabezado que se muestra y va en la plantilla */
  label: string;
  /** Otros encabezados que se reconocen (en minúsculas, sin acentos) */
  aliases: string[];
  required?: boolean;
  example: string;
}

export interface BulkSpec {
  entity: BulkEntity;
  /** Nombre en plural para textos ("productos") */
  noun: string;
  columns: BulkColumn[];
  /** Cómo se evita duplicar: qué columna identifica un registro que ya existe */
  matchBy: string;
}

const col = (key: string, label: string, aliases: string[], example: string, required = false): BulkColumn => ({
  key,
  label,
  aliases,
  example,
  required,
});

export const BULK_SPECS: Record<BulkEntity, BulkSpec> = {
  products: {
    entity: "products",
    noun: "productos",
    matchBy: "Código de barras o nombre",
    columns: [
      col("name", "Nombre", ["nombre", "producto", "name"], "Arroz 5 lb", true),
      col("barcode", "Código de barras", ["codigo de barras", "codigo", "barcode", "ean"], "7501234567890"),
      col("sku", "SKU", ["sku", "clave"], "ARR-5"),
      col("category", "Categoría", ["categoria", "category"], "Granos"),
      col("unit", "Unidad", ["unidad", "unit"], "pza"),
      col("price", "Precio", ["precio", "precio de venta", "price"], "3.95", true),
      col("cost", "Costo", ["costo", "cost"], "3.10"),
      col("stock", "Existencia", ["existencia", "stock", "inventario"], "24"),
      col("minStock", "Stock mínimo", ["stock minimo", "minimo", "min"], "6"),
      col("wholesalePrice", "Precio mayoreo", ["precio mayoreo", "mayoreo"], "3.70"),
      col("wholesaleMinQty", "Mayoreo desde", ["mayoreo desde"], "12"),
      col("taxRate", "Impuesto", ["impuesto", "itbms", "iva", "tax"], "7%"),
      col("description", "Descripción", ["descripcion", "description"], ""),
      col("packSize", "Unidades por caja", ["unidades por caja", "por caja"], ""),
      col("iepsRate", "IEPS", ["ieps"], ""),
      col("satProductKey", "Clave SAT", ["clave sat"], ""),
      col("satUnitKey", "Clave unidad SAT", ["clave unidad sat"], ""),
    ],
  },
  categories: {
    entity: "categories",
    noun: "categorías",
    matchBy: "Nombre",
    columns: [col("name", "Nombre", ["nombre", "categoria", "name"], "Bebidas", true)],
  },
  customers: {
    entity: "customers",
    noun: "clientes",
    matchBy: "Teléfono o nombre",
    columns: [
      col("name", "Nombre", ["nombre", "cliente", "name"], "Juana Pérez", true),
      col("phone", "Teléfono", ["telefono", "celular", "whatsapp", "phone"], "6123-4567"),
      col("email", "Correo", ["correo", "email", "e-mail"], "juana@correo.com"),
      col("creditLimit", "Límite de crédito", ["limite de credito", "limite", "credito"], "50"),
      col("creditDays", "Días de crédito", ["dias de credito", "dias"], "15"),
      col("tags", "Etiquetas", ["etiquetas", "tags"], "vecina; frecuente"),
      col("birthday", "Cumpleaños", ["cumpleanos", "fecha de nacimiento", "birthday"], "15/03/1990"),
      col("marketingConsent", "Acepta mensajes", ["acepta mensajes", "consentimiento", "whatsapp ok"], "sí"),
      col("isSenior", "Jubilado", ["jubilado", "tercera edad"], "no"),
      col("ruc", "RUC", ["ruc"], ""),
      col("dv", "DV", ["dv"], ""),
      col("notes", "Notas", ["notas", "observaciones", "notes"], ""),
    ],
  },
  suppliers: {
    entity: "suppliers",
    noun: "proveedores",
    matchBy: "Nombre",
    columns: [
      col("name", "Nombre", ["nombre", "proveedor", "empresa", "name"], "Distribuidora del Istmo", true),
      col("contact", "Contacto", ["contacto", "vendedor"], "Carlos"),
      col("phone", "Teléfono", ["telefono", "celular", "phone"], "6765-4321"),
      col("email", "Correo", ["correo", "email"], "ventas@distribuidora.com"),
      col("creditDays", "Días de crédito", ["dias de credito", "dias", "credito"], "30"),
      col("notes", "Notas", ["notas", "notes"], "Visita los martes"),
    ],
  },
  expenses: {
    entity: "expenses",
    noun: "gastos",
    matchBy: "No se combinan: cada fila es un gasto nuevo",
    columns: [
      col("date", "Fecha", ["fecha", "date"], "01/09/2026", true),
      col("category", "Categoría", ["categoria", "tipo", "category"], "Luz", true),
      col("amount", "Monto", ["monto", "importe", "total", "amount"], "85.40", true),
      col("paymentMethod", "Forma de pago", ["forma de pago", "pago", "metodo"], "transferencia"),
      col("description", "Descripción", ["descripcion", "detalle", "concepto", "description"], "Recibo de agosto"),
    ],
  },
  employees: {
    entity: "employees",
    noun: "empleados",
    matchBy: "Cédula o nombre",
    columns: [
      col("name", "Nombre", ["nombre", "empleado", "name"], "Ana Rodríguez", true),
      col("idNumber", "Cédula", ["cedula", "identificacion", "id"], "8-123-456"),
      col("socialSecurityNumber", "Seguro social", ["seguro social", "css", "numero de seguro social"], ""),
      col("position", "Puesto", ["puesto", "cargo"], "Cajera"),
      col("salary", "Salario", ["salario", "sueldo", "salary"], "650", true),
      col("frequency", "Frecuencia", ["frecuencia", "pago"], "quincenal"),
      col("hireDate", "Fecha de ingreso", ["fecha de ingreso", "ingreso", "fecha"], "01/02/2025", true),
    ],
  },
};

/** Quita acentos y espacios de más para comparar encabezados. */
export function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\*/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Lee lo pegado desde Excel (tabulaciones) o un CSV (comas o punto y coma). */
export function parseTable(text: string) {
  return parseCsv(text);
}

export interface MappedTable {
  /** Columna de la especificación que corresponde a cada columna del archivo (o null) */
  mapping: (string | null)[];
  records: Record<string, string>[];
  /** Encabezados obligatorios que no se encontraron */
  missing: string[];
  /** Encabezados del archivo que no se reconocieron */
  ignored: string[];
}

export function mapTable(spec: BulkSpec, table: string[][]): MappedTable {
  const [header = [], ...rows] = table;
  const mapping = header.map((h) => {
    const n = normalizeHeader(h);
    const match = spec.columns.find(
      (c) => normalizeHeader(c.label) === n || c.key.toLowerCase() === n || c.aliases.includes(n)
    );
    return match?.key ?? null;
  });
  const found = new Set(mapping.filter(Boolean));
  const records = rows.map((row) => {
    const rec: Record<string, string> = {};
    mapping.forEach((key, i) => {
      if (key && row[i] !== undefined && row[i].trim() !== "") rec[key] = row[i].trim();
    });
    return rec;
  });
  return {
    mapping,
    records,
    missing: spec.columns.filter((c) => c.required && !found.has(c.key)).map((c) => c.label),
    ignored: header.filter((_, i) => mapping[i] === null && header[i].trim() !== ""),
  };
}

// ---------- Lectura de celdas ----------

const moneyCell = (v?: string) => (v === undefined ? undefined : v.replace(/B\/\.|\$|,|\s/g, ""));

const TRUE_WORDS = ["si", "sí", "s", "x", "yes", "y", "true", "1", "verdadero"];
const boolCell = (v?: string) => (v === undefined ? undefined : TRUE_WORDS.includes(v.trim().toLowerCase()));

/** Acepta aaaa-mm-dd o dd/mm/aaaa (como escribe Excel en Panamá y México). */
export function dateCell(v?: string) {
  if (!v) return undefined;
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return s;
}

const UNIT_ALIASES: Record<string, string> = {
  pieza: "PIECE",
  piezas: "PIECE",
  pza: "PIECE",
  pz: "PIECE",
  unidad: "PIECE",
  piece: "PIECE",
  kg: "KG",
  kilo: "KG",
  g: "G",
  gr: "G",
  l: "L",
  lt: "L",
  litro: "L",
  ml: "ML",
  m: "M",
  metro: "M",
  lb: "LB",
  lbs: "LB",
  libra: "LB",
  libras: "LB",
  oz: "OZ",
  onza: "OZ",
  gal: "GAL",
  galon: "GAL",
  galón: "GAL",
};

const PAYMENT_ALIASES: Record<string, string> = {
  efectivo: "CASH",
  cash: "CASH",
  tarjeta: "CARD",
  card: "CARD",
  transferencia: "TRANSFER",
  ach: "TRANSFER",
  transfer: "TRANSFER",
  yappy: "YAPPY",
};

const rateCell = (v?: string) => {
  if (v === undefined) return undefined;
  if (/^exento$/i.test(v.trim())) return "0";
  const n = Number(v.replace("%", "").trim());
  return Number.isFinite(n) ? String(n > 1 ? n / 100 : n) : v;
};

/** Convierte las celdas de una fila en lo que espera el esquema de ese registro. */
export function toInput(entity: BulkEntity, r: Record<string, string>): Record<string, unknown> {
  switch (entity) {
    case "products":
      return {
        ...r,
        unit: r.unit ? (UNIT_ALIASES[r.unit.toLowerCase()] ?? r.unit.toUpperCase()) : undefined,
        price: moneyCell(r.price),
        cost: moneyCell(r.cost),
        wholesalePrice: moneyCell(r.wholesalePrice),
        taxRate: rateCell(r.taxRate),
        iepsRate: rateCell(r.iepsRate),
        category: undefined,
      };
    case "categories":
      return { name: r.name };
    case "customers":
      return {
        ...r,
        creditLimit: moneyCell(r.creditLimit),
        tags: r.tags ? r.tags.split(/[;|]/).map((t) => t.trim()).filter(Boolean) : undefined,
        birthday: dateCell(r.birthday),
        marketingConsent: boolCell(r.marketingConsent),
        isSenior: boolCell(r.isSenior),
      };
    case "suppliers":
      return { ...r };
    case "expenses":
      return {
        ...r,
        amount: moneyCell(r.amount),
        date: dateCell(r.date),
        paymentMethod: r.paymentMethod
          ? (PAYMENT_ALIASES[r.paymentMethod.trim().toLowerCase()] ?? r.paymentMethod.toUpperCase())
          : undefined,
      };
    case "employees":
      return {
        ...r,
        salary: moneyCell(r.salary),
        hireDate: dateCell(r.hireDate),
        frequency: r.frequency ? r.frequency.trim().toUpperCase() : undefined,
      };
  }
}

const SCHEMAS: Record<BulkEntity, z.ZodType> = {
  products: productCreateSchema,
  categories: categorySchema,
  customers: customerSchema,
  suppliers: supplierSchema,
  expenses: expenseSchema,
  employees: employeeSchema,
};

const FIELD_LABELS = Object.fromEntries(
  Object.values(BULK_SPECS).flatMap((s) => s.columns.map((c) => [`${s.entity}.${c.key}`, c.label]))
);

export type RowCheck = { ok: true; data: unknown } | { ok: false; error: string };

/** Valida una fila; el mensaje nombra la columna como aparece en la plantilla. */
export function checkRow(entity: BulkEntity, record: Record<string, string>): RowCheck {
  const parsed = SCHEMAS[entity].safeParse(toInput(entity, record));
  if (parsed.success) return { ok: true, data: parsed.data };
  const issue = parsed.error.issues[0];
  const field = String(issue.path[0] ?? "");
  const label = FIELD_LABELS[`${entity}.${field}`] ?? field;
  return { ok: false, error: label ? `${label}: ${issue.message}` : issue.message };
}

/** Plantilla CSV con los encabezados y una fila de ejemplo. */
export function templateCsv(spec: BulkSpec) {
  const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return (
    "﻿" +
    [spec.columns.map((c) => c.label), spec.columns.map((c) => c.example)]
      .map((row) => row.map(escape).join(","))
      .join("\r\n")
  );
}
