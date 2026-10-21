import { getLanguage } from "obsidian";

/**
 * Obsidian's own UI language, with the browser locale as a fallback for
 * environments where the language setting is not available.
 */
export function isChineseUI(): boolean {
  const lang = getLanguage() || navigator.language || "";
  return lang.toLowerCase().startsWith("zh");
}

/** Pick the Chinese string when Obsidian's UI language is Chinese, English otherwise. */
export function tr(en: string, zh: string): string {
  return isChineseUI() ? zh : en;
}
