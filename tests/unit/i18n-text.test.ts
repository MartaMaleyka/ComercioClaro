import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { missingTexts, translateText } from "@/lib/i18n-text";

/** Todos los textos envueltos en tr("...") dentro de las pantallas. */
function screenTexts() {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith(".tsx")) files.push(path);
    }
  };
  walk("src/app");
  walk("src/components");

  const texts = new Set<string>();
  for (const file of files) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "tr") {
        const [arg] = node.arguments;
        if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) texts.add(arg.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return [...texts];
}

describe("traducción de pantallas", () => {
  const texts = screenTexts();

  it("encuentra los textos de las pantallas", () => {
    expect(texts.length).toBeGreaterThan(500);
  });

  it.each(["zh", "en"])("todas las pantallas tienen traducción en %s", (language) => {
    expect(missingTexts(language, texts)).toEqual([]);
  });

  it("reemplaza parámetros y usa el español como respaldo", () => {
    expect(translateText("zh", "Venta #{folio}", { folio: 12 })).toBe("销售 #12");
    expect(translateText("en", "Imprimir ({n})", { n: 3 })).toBe("Print (3)");
    expect(translateText("es", "Guardar")).toBe("Guardar");
    expect(translateText("fr", "Guardar")).toBe("Guardar");
    expect(translateText("zh", "Texto que no existe")).toBe("Texto que no existe");
  });
});
