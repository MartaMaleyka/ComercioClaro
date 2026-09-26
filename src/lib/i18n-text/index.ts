/**
 * Traducción de textos de pantalla al estilo gettext: el texto en español es la clave.
 * Si falta una traducción se muestra el español, así una pantalla nunca queda en blanco.
 */
import { zh } from "./zh";
import { en } from "./en";

const dictionaries: Record<string, Record<string, string>> = { zh, en };

export function translateText(language: string, text: string, params?: Record<string, string | number>) {
  const translated = dictionaries[language]?.[text] ?? text;
  if (!params) return translated;
  return translated.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

/** Claves sin traducir en un idioma (para pruebas y para el reporte de traducción). */
export function missingTexts(language: string, texts: string[]) {
  const dict = dictionaries[language] ?? {};
  return texts.filter((t) => !(t in dict));
}
