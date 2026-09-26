/** CSV mínimo compatible con Excel (RFC 4180): comillas dobles, comas y saltos de línea. */

export function toCsv(headers: string[], rows: (string | number | boolean | null | undefined)[][]) {
  const escape = (value: string | number | boolean | null | undefined) => {
    if (value === null || value === undefined) return "";
    let s = String(value);
    // Evita inyección de fórmulas al abrir el archivo en hojas de cálculo.
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM para que Excel detecte UTF-8 (acentos y ñ).
  return "﻿" + [headers, ...rows].map((r) => r.map(escape).join(",")).join("\r\n");
}

export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

/**
 * Separador de la primera línea; si la primera línea no tiene ninguno (los estados de cuenta
 * traen un título antes del encabezado), el más frecuente en las primeras líneas.
 */
function detectDelimiter(text: string) {
  const lines = text.split(/\r?\n/, 10);
  const pick = (candidates: string[]) => {
    const count = (d: string) => Math.max(0, ...candidates.map((l) => l.split(d).length - 1));
    const [semicolons, commas, tabs] = [count(";"), count(","), count("\t")];
    if (tabs > commas && tabs > semicolons) return "\t";
    if (semicolons > commas) return ";";
    return commas > 0 ? "," : null;
  };
  return pick(lines.slice(0, 1)) ?? pick(lines) ?? ",";
}

export function csvResponse(filename: string, content: string) {
  return new Response(content, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
