/**
 * 一套完整的"外观主题"。所有数值为 0 / 空字符串时表示"跟随当前 Obsidian 主题"，
 * 只有设置过的字段才会生成 CSS 规则，避免无谓地覆盖用户已有的主题。
 */
export interface ThemeProfile {
  id: string;
  name: string;

  /** 阅读视图正文最大宽度（px）。0 = 不限制。 */
  readingWidth: number;
  /** 编辑/实时预览视图正文最大宽度（px）。0 = 不限制。 */
  editingWidth: number;
  /** 正文字号（px）。0 = 跟随主题。 */
  fontSize: number;
  /** 行高倍数。0 = 跟随主题。 */
  lineHeight: number;
  /** 段间距（em）。0 = 跟随主题。 */
  paragraphSpacing: number;
  /** 正文字体族。空 = 跟随主题。 */
  fontFamily: string;

  /** 主背景色 #rrggbb。空 = 跟随主题。 */
  bgColor: string;
  /** 背景图：vault 相对路径（如 attachments/bg.jpg）或 http(s) URL。空 = 不用图。 */
  bgImage: string;
  /** 主背景不透明度 0..1，配合 bgImage / 玻璃效果使用。 */
  bgOpacity: number;
  /** 侧栏与面板不透明度 0..1（半透明效果）。 */
  panelOpacity: number;
  /** 面板背景模糊半径（px），0 = 不模糊。 */
  blur: number;

  textColor: string;
  mutedColor: string;
  accentColor: string;

  /** 墨水屏模式：灰度、提高对比度、关闭动画与阴影。 */
  eink: boolean;
  /** 墨水屏对比度倍数 0.8..1.6。 */
  einkContrast: number;
}

/** 文件夹 → 主题 的绑定规则。 */
export interface ScopeRule {
  /** vault 相对路径，不含首尾斜杠。空字符串表示整个库。 */
  folder: string;
  profileId: string;
}

export interface ThemeStudioSettings {
  schemaVersion: number;
  /** 未命中任何规则时使用的主题。 */
  defaultProfileId: string;
  profiles: ThemeProfile[];
  scopeRules: ScopeRule[];
  /** 状态栏显示当前生效的主题名。 */
  showStatusBar: boolean;
}

export const DEFAULT_SETTINGS: ThemeStudioSettings = {
  schemaVersion: 1,
  // 与用户原先使用的 Wide View 主题（1400px）保持一致，装上后观感不变。
  defaultProfileId: "wide",
  profiles: [],
  scopeRules: [],
  showStatusBar: true,
};
