import { App } from "obsidian";
import type { ThemeProfile, ThemeStudioSettings } from "./types";
import { resolveProfile } from "./ScopeResolver";

const BODY_PROFILE_ATTR = "data-ts-profile";
const BODY_EINK_ATTR = "data-ts-eink";

/**
 * 运行时只在 <body> 上写这些属性 / CSS 变量，具体规则全部写在 styles.css 里。
 * 这样既不用动态创建 <style>，也能在切换主题时即时生效。
 */
const BODY_ATTRS = [
  BODY_PROFILE_ATTR,
  BODY_EINK_ATTR,
  "data-ts-reading-width",
  "data-ts-editing-width",
  "data-ts-font-size",
  "data-ts-line-height",
  "data-ts-paragraph-spacing",
  "data-ts-font-family",
  "data-ts-background-image",
  "data-ts-blur",
] as const;

const BODY_PROPS = [
  "--ts-reading-width",
  "--ts-editing-width",
  "--ts-font-size",
  "--ts-line-height",
  "--ts-paragraph-spacing",
  "--ts-font-family",
  "--ts-bg-image",
  "--ts-bg-scrim",
  "--ts-blur",
  "--ts-eink-contrast",
  "--background-primary",
  "--background-primary-alt",
  "--background-secondary",
  "--background-secondary-alt",
  "--text-normal",
  "--inline-title-color",
  "--text-title-h1",
  "--text-title-h2",
  "--text-title-h3",
  "--text-title-h4",
  "--text-title-h5",
  "--text-title-h6",
  "--text-muted",
  "--text-faint",
  "--color-accent",
  "--interactive-accent",
  "--text-accent",
  "--link-color",
  "--link-external-color",
] as const;

/** #rgb / #rrggbb → rgba(...)，透明度按需叠加。 */
export function hexToRgba(hex: string, alpha: number): string {
  const raw = hex.trim().replace(/^#/, "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw.length === 6
        ? raw
        : "000000";
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const a = Math.min(1, Math.max(0, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** 背景图统一成可用的 URL：vault 相对路径走 Obsidian 资源路径，其余视为外部 URL。 */
function toImageUrl(app: App, value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  if (/^(https?:|data:|app:\/\/)/i.test(raw)) return raw;
  const path = raw.replace(/^\/+/, "");
  return app.vault.adapter.getResourcePath(path);
}

function cssEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * 负责：把当前文件的主题写到 body 上（属性 + CSS 变量）。
 * CSS 规则本身固定在 styles.css，避免动态注入 <style>。
 */
export class ThemeEngine {
  constructor(
    private app: App,
    private getSettings: () => ThemeStudioSettings,
  ) {}

  mount(): void {
    this.apply();
  }

  unmount(): void {
    this.clear(document.body);
  }

  /** 设置改动后重新应用当前主题。 */
  render(): void {
    this.apply();
  }

  /** 按当前活动文件解析主题并应用到 body。 */
  apply(): ThemeProfile {
    const settings = this.getSettings();
    const file = this.app.workspace.getActiveFile();
    const profile = resolveProfile(file ? file.path : null, settings);
    const body = document.body;

    this.clear(body);
    body.setAttribute(BODY_PROFILE_ATTR, profile.id);

    // ── 正文宽度 ──────────────────────────────────────────────────────────────
    if (profile.readingWidth > 0) {
      body.setAttribute("data-ts-reading-width", "1");
      body.style.setProperty("--ts-reading-width", `${profile.readingWidth}px`);
    }
    if (profile.editingWidth > 0) {
      body.setAttribute("data-ts-editing-width", "1");
      body.style.setProperty("--ts-editing-width", `${profile.editingWidth}px`);
    }

    // ── 排版 ──────────────────────────────────────────────────────────────────
    if (profile.lineHeight > 0) {
      body.setAttribute("data-ts-line-height", "1");
      body.style.setProperty("--ts-line-height", String(profile.lineHeight));
    }
    if (profile.fontSize > 0) {
      body.setAttribute("data-ts-font-size", "1");
      body.style.setProperty("--ts-font-size", `${profile.fontSize}px`);
    }
    if (profile.paragraphSpacing > 0) {
      body.setAttribute("data-ts-paragraph-spacing", "1");
      body.style.setProperty("--ts-paragraph-spacing", `${profile.paragraphSpacing}em`);
    }
    const fontFamily = profile.fontFamily.trim();
    if (fontFamily) {
      body.setAttribute("data-ts-font-family", "1");
      body.style.setProperty("--ts-font-family", fontFamily);
    }

    // ── 背景与透明度 ──────────────────────────────────────────────────────────
    if (profile.bgColor) {
      const primary = hexToRgba(profile.bgColor, profile.bgOpacity);
      body.style.setProperty("--background-primary", primary);
      body.style.setProperty("--background-primary-alt", primary);

      // 只有用户真的想要半透明侧栏时才改写次级背景，避免把侧栏和正文刷成同色。
      if (profile.panelOpacity < 1) {
        const panel = hexToRgba(
          profile.bgColor,
          Math.min(1, profile.bgOpacity * profile.panelOpacity),
        );
        body.style.setProperty("--background-secondary", panel);
        body.style.setProperty("--background-secondary-alt", panel);
      }
    }

    const imageUrl = profile.bgImage ? toImageUrl(this.app, profile.bgImage) : null;
    if (imageUrl) {
      const scrim = hexToRgba(profile.bgColor || "#000000", Math.max(profile.bgOpacity, 0.15));
      body.setAttribute("data-ts-background-image", "1");
      body.style.setProperty("--ts-bg-image", `url("${cssEscape(imageUrl)}")`);
      body.style.setProperty("--ts-bg-scrim", scrim);
    }

    if (profile.blur > 0) {
      body.setAttribute("data-ts-blur", "1");
      body.style.setProperty("--ts-blur", `${profile.blur}px`);
    }

    // ── 文字颜色 ──────────────────────────────────────────────────────────────
    if (profile.textColor) {
      for (const prop of [
        "--text-normal",
        "--inline-title-color",
        "--text-title-h1",
        "--text-title-h2",
        "--text-title-h3",
        "--text-title-h4",
        "--text-title-h5",
        "--text-title-h6",
      ]) {
        body.style.setProperty(prop, profile.textColor);
      }
    }
    if (profile.mutedColor) {
      body.style.setProperty("--text-muted", profile.mutedColor);
      body.style.setProperty("--text-faint", profile.mutedColor);
    }
    if (profile.accentColor) {
      for (const prop of [
        "--color-accent",
        "--interactive-accent",
        "--text-accent",
        "--link-color",
        "--link-external-color",
      ]) {
        body.style.setProperty(prop, profile.accentColor);
      }
    }

    // ── 墨水屏 ────────────────────────────────────────────────────────────────
    if (profile.eink) {
      body.setAttribute(BODY_EINK_ATTR, "1");
      body.style.setProperty("--ts-eink-contrast", String(profile.einkContrast));
    }

    return profile;
  }

  private clear(body: HTMLElement): void {
    for (const attr of BODY_ATTRS) body.removeAttribute(attr);
    for (const prop of BODY_PROPS) body.style.removeProperty(prop);
  }
}
