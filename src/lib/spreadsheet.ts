/**
 * Hoja de cálculo en formato XML de Excel 2003 (SpreadsheetML): Excel, LibreOffice y Google
 * Sheets la abren sin librerías adicionales. Los números se guardan como números.
 */
type Cell = string | number | null | undefined;

const escapeXml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function cell(value: Cell) {
  if (value === null || value === undefined || value === "") return "<Cell/>";
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<Cell><Data ss:Type="Number">${value}</Data></Cell>`;
  }
  return `<Cell><Data ss:Type="String">${escapeXml(String(value))}</Data></Cell>`;
}

export function toSpreadsheet(sheets: { name: string; headers: string[]; rows: Cell[][] }[]) {
  const body = sheets
    .map(
      (s) =>
        `<Worksheet ss:Name="${escapeXml(s.name.slice(0, 31))}"><Table>` +
        `<Row>${s.headers.map((h) => `<Cell ss:StyleID="h"><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`).join("")}</Row>` +
        s.rows.map((r) => `<Row>${r.map(cell).join("")}</Row>`).join("") +
        `</Table></Worksheet>`
    )
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n<?mso-application progid="Excel.Sheet"?>\n` +
    `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">` +
    `<Styles><Style ss:ID="h"><Font ss:Bold="1"/></Style></Styles>${body}</Workbook>`
  );
}

export function spreadsheetResponse(filename: string, content: string) {
  return new Response(content, {
    headers: {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
