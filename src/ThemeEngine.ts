import { App, TFile } from "obsidian";
import type { ThemeProfile, ThemeStudioSettings } from "./types";
import { resolveProfile } from "./ScopeResolver";

const STYLE_EL_ID = "theme-studio-dynamic";
const BODY_PROFILE_ATTR = "data-ts-profile";
const BODY_EINK_ATTR = "data-ts-eink";

/** #rgb / #rrggbb → rgba(...)，透明度按需叠加。 */
export function hexToRgba(hex: string, alpha: number): string {
  const raw = hex.trim().replace(/^#/, "");
  const full =
    raw.length === 3
      ? raw.split("").map((c) => c + c).join("")
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
  const file = app.vault.getAbstractFileByPath(path);
  if (file instanceof TFile) return app.vault.adapter.getResourcePath(path);
  return app.vault.adapter.getResourcePath(path);
}

function cssEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * 把一个主题编译成 CSS。
 *
 * 通过 `body[data-ts-profile="<id>"]` 做作用域，切换主题只需改 body 的一个属性，
 * 不需要重建样式表，也不会和用户当前启用的 Obsidian 主题打架（选择器更具体）。
 */
export function buildProfileCss(app: App, p: ThemeProfile): string {
  const sel = `body[${BODY_PROFILE_ATTR}="${cssEscape(p.id)}"]`;
  const out: string[] = [];

  // ── 正文宽度 ──────────────────────────────────────────────────────────────
  // --file-line-width 只在"可读行宽"开启时生效；关闭时补一条 max-width 兜底。
  // 宽度为 0 时整条不生成，让当前 Obsidian 主题的默认值继续生效。
  if (p.readingWidth > 0) {
    const rw = `${p.readingWidth}px`;
    out.push(`${sel} .markdown-preview-view { --file-line-width: ${rw}; }`);
    out.push(
      `${sel} .markdown-preview-view:not(.is-readable-line-width) .markdown-preview-sizer` +
        ` { max-width: ${rw}; margin-inline: auto; }`,
    );
  }
  if (p.editingWidth > 0) {
    const ew = `${p.editingWidth}px`;
    out.push(`${sel} .markdown-source-view { --file-line-width: ${ew}; }`);
    out.push(
      `${sel} .markdown-source-view:not(.is-readable-line-width) .cm-content` +
        ` { max-width: ${ew}; margin-inline: auto; }`,
    );
  }

  // ── 排版 ──────────────────────────────────────────────────────────────────
  const typography: string[] = [];
  if (p.lineHeight > 0) typography.push(`--line-height-normal: ${p.lineHeight};`);
  if (p.fontSize > 0) typography.push(`--font-text-size: ${p.fontSize}px;`);
  if (p.paragraphSpacing > 0) typography.push(`--p-spacing: ${p.paragraphSpacing}em;`);
  if (p.fontFamily.trim()) typography.push(`--font-text: ${p.fontFamily.trim()};`);
  if (typography.length) {
    out.push(`${sel} .markdown-preview-view, ${sel} .markdown-source-view { ${typography.join(" ")} }`);
  }

  // ── 背景与透明度 ──────────────────────────────────────────────────────────
  if (p.bgColor) {
    const primary = hexToRgba(p.bgColor, p.bgOpacity);
    const vars = [
      `--background-primary: ${primary};`,
      `--background-primary-alt: ${primary};`,
    ];
    // 只有用户真的想要半透明侧栏时才改写次级背景，避免把侧栏和正文刷成同色。
    if (p.panelOpacity < 1) {
      const panel = hexToRgba(p.bgColor, Math.min(1, p.bgOpacity * p.panelOpacity));
      vars.push(`--background-secondary: ${panel};`, `--background-secondary-alt: ${panel};`);
    }
    out.push(`${sel} { ${vars.join(" ")} }`);
  }

  const imageUrl = p.bgImage ? toImageUrl(app, p.bgImage) : null;
  if (imageUrl) {
    const scrim = hexToRgba(p.bgColor || "#000000", Math.max(p.bgOpacity, 0.15));
    out.push(
      `${sel} .workspace { background-image: linear-gradient(${scrim}, ${scrim}), url("${cssEscape(imageUrl)}");` +
        ` background-size: cover; background-position: center center; background-repeat: no-repeat; }`,
    );
  }

  if (p.blur > 0) {
    out.push(
      `${sel} .workspace-split.mod-left-split .workspace-leaf-content,` +
        `${sel} .workspace-split.mod-right-split .workspace-leaf-content` +
        ` { backdrop-filter: blur(${p.blur}px); }`,
    );
  }

  // ── 文字颜色 ──────────────────────────────────────────────────────────────
  const colors: string[] = [];
  if (p.textColor) {
    colors.push(
      `--text-normal: ${p.textColor};`,
      `--inline-title-color: ${p.textColor};`,
      `--text-title-h1: ${p.textColor};`,
      `--text-title-h2: ${p.textColor};`,
      `--text-title-h3: ${p.textColor};`,
      `--text-title-h4: ${p.textColor};`,
      `--text-title-h5: ${p.textColor};`,
      `--text-title-h6: ${p.textColor};`,
    );
  }
  if (p.mutedColor) colors.push(`--text-muted: ${p.mutedColor};`, `--text-faint: ${p.mutedColor};`);
  if (p.accentColor) {
    colors.push(
      `--color-accent: ${p.accentColor};`,
      `--interactive-accent: ${p.accentColor};`,
      `--text-accent: ${p.accentColor};`,
      `--link-color: ${p.accentColor};`,
      `--link-external-color: ${p.accentColor};`,
    );
  }
  if (colors.length) out.push(`${sel} { ${colors.join(" ")} }`);

  return out.join("\n");
}

/** 墨水屏模式是全局开关（与当前生效文件绑定的主题决定），单独成组。 */
function buildEinkCss(profiles: ThemeProfile[]): string {
  const contrastByProfile = profiles
    .filter((p) => p.eink)
    .map(
      (p) =>
        `body[${BODY_PROFILE_ATTR}="${cssEscape(p.id)}"][${BODY_EINK_ATTR}="1"]` +
        ` { --ts-eink-contrast: ${p.einkContrast}; }`,
    )
    .join("\n");

  return [
    contrastByProfile,
    `body[${BODY_EINK_ATTR}="1"] { --ts-eink-contrast: 1; }`,
    `body[${BODY_EINK_ATTR}="1"] .workspace { filter: grayscale(1) contrast(var(--ts-eink-contrast)); }`,
    `body[${BODY_EINK_ATTR}="1"] .workspace *, body[${BODY_EINK_ATTR}="1"] .workspace *::before,` +
      ` body[${BODY_EINK_ATTR}="1"] .workspace *::after { transition: none !important; animation: none !important; }`,
    `body[${BODY_EINK_ATTR}="1"] .workspace { box-shadow: none; }`,
    `body[${BODY_EINK_ATTR}="1"] .workspace .markdown-preview-view,` +
      ` body[${BODY_EINK_ATTR}="1"] .workspace .cm-editor { text-shadow: none; }`,
  ].join("\n");
}

/**
 * 负责：生成样式表、根据当前活动文件切换 body 上的主题属性。
 */
export class ThemeEngine {
  private styleEl: HTMLStyleElement | null = null;

  constructor(
    private app: App,
    private getSettings: () => ThemeStudioSettings,
  ) {}

  mount(): void {
    if (this.styleEl) return;
    const el = document.createElement("style");
    el.id = STYLE_EL_ID;
    document.head.appendChild(el);
    this.styleEl = el;
    this.render();
  }

  unmount(): void {
    this.styleEl?.remove();
    this.styleEl = null;
    document.body.removeAttribute(BODY_PROFILE_ATTR);
    document.body.removeAttribute(BODY_EINK_ATTR);
  }

  /** 重新生成样式表（设置改动后调用）。 */
  render(): void {
    if (!this.styleEl) return;
    const settings = this.getSettings();
    const blocks = settings.profiles.map((p) => buildProfileCss(this.app, p));
    blocks.push(buildEinkCss(settings.profiles));
    this.styleEl.textContent = blocks.join("\n\n");
    this.apply();
  }

  /** 按当前活动文件解析主题并落到 body 属性上。 */
  apply(): ThemeProfile {
    const settings = this.getSettings();
    const file = this.app.workspace.getActiveFile();
    const profile = resolveProfile(file ? file.path : null, settings);

    document.body.setAttribute(BODY_PROFILE_ATTR, profile.id);
    if (profile.eink) document.body.setAttribute(BODY_EINK_ATTR, "1");
    else document.body.removeAttribute(BODY_EINK_ATTR);

    return profile;
  }
}
