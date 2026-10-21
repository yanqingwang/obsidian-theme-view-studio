/**
 * Obsidian stores the UI language in localStorage under `language` (e.g. `zh`, `en`).
 * Read it directly so the plugin follows the app language without its own setting.
 */
export function isChineseUI(): boolean {
  try {
    const lang = window.localStorage.getItem("language");
    if (lang) return lang.toLowerCase().startsWith("zh");
  } catch {
    // localStorage unavailable — fall through to the system locale
  }
  return (navigator.language || "").toLowerCase().startsWith("zh");
}

/** Pick the Chinese string when Obsidian's UI language is Chinese, English otherwise. */
export function tr(en: string, zh: string): string {
  return isChineseUI() ? zh : en;
}
