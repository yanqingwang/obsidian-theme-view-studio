import type { App } from "obsidian";

/**
 * 把用户填的图片值统一成可用的 URL。
 *
 * vault 相对路径走 Obsidian 的资源路径，其余（http/https/data/app://）原样返回。
 * 从 ThemeEngine 抽出来共用：背景图和主页积木封面要的是同一套判定规则，
 * 复制一份的话以后改一处就会漏另一处。
 */
export function toImageUrl(app: App, value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  if (/^(https?:|data:|app:\/\/)/i.test(raw)) return raw;
  const path = raw.replace(/^\/+/, "");
  return app.vault.adapter.getResourcePath(path);
}

/** 给 CSS url("...") 用的转义：只处理反斜杠与双引号，够用且可预测。 */
export function cssEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}