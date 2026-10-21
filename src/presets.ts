import type { ThemeProfile } from "./types";

export type ProfileDraft = Omit<ThemeProfile, "id" | "name">;

/** 所有字段"跟随主题"的空档，作为新建主题的起点。 */
export const NEUTRAL_PROFILE: ProfileDraft = {
  readingWidth: 0,
  editingWidth: 0,
  fontSize: 0,
  lineHeight: 0,
  paragraphSpacing: 0,
  fontFamily: "",
  bgColor: "",
  bgImage: "",
  bgOpacity: 1,
  panelOpacity: 1,
  blur: 0,
  textColor: "",
  mutedColor: "",
  accentColor: "",
  eink: false,
  einkContrast: 1,
};

export interface Preset {
  key: string;
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
  values: ProfileDraft;
}

/**
 * 内置预设。只挑"值得做成主题"的组合，全部字段都可以在设置页里继续微调。
 */
export const PRESETS: Preset[] = [
  {
    key: "follow",
    name: "跟随主题",
    nameEn: "Follow theme",
    description: "不改动任何外观，只作为默认主题占位。",
    descriptionEn: "Leave every appearance setting untouched; a placeholder default.",
    values: { ...NEUTRAL_PROFILE },
  },
  {
    key: "wide",
    name: "宽屏阅读",
    nameEn: "Wide reading",
    description: "正文铺满宽度，适合大屏幕看表格和代码。",
    descriptionEn: "Full-width body text for tables and code on a large screen.",
    values: { ...NEUTRAL_PROFILE, readingWidth: 1400, editingWidth: 1400 },
  },
  {
    key: "focus",
    name: "专注窄栏",
    nameEn: "Focus column",
    description: "窄正文加宽松行距，适合长文写作。",
    descriptionEn: "Narrow measure with generous leading, for long-form writing.",
    values: {
      ...NEUTRAL_PROFILE,
      readingWidth: 720,
      editingWidth: 780,
      lineHeight: 1.8,
      paragraphSpacing: 1.1,
    },
  },
  {
    key: "eink",
    name: "墨水屏",
    nameEn: "E-ink",
    description: "灰度、高对比、零动画，近似电子墨水。",
    descriptionEn: "Grayscale, high contrast, no motion — close to an e-ink panel.",
    values: {
      ...NEUTRAL_PROFILE,
      readingWidth: 760,
      editingWidth: 760,
      lineHeight: 1.9,
      paragraphSpacing: 1.2,
      bgColor: "#f2f1ec",
      textColor: "#141414",
      mutedColor: "#5a5a56",
      accentColor: "#3b3b3b",
      eink: true,
      einkContrast: 1.15,
    },
  },
  {
    key: "paper",
    name: "纸感浅色",
    nameEn: "Warm paper",
    description: "米黄纸色背景与暖棕文字，长时间阅读更柔和。",
    descriptionEn: "Cream paper background with warm brown text, easier for long reads.",
    values: {
      ...NEUTRAL_PROFILE,
      readingWidth: 800,
      editingWidth: 820,
      lineHeight: 1.85,
      paragraphSpacing: 1.1,
      bgColor: "#f6efe3",
      textColor: "#3b3226",
      mutedColor: "#7a6c57",
      accentColor: "#a9773f",
    },
  },
  {
    key: "night",
    name: "深色夜读",
    nameEn: "Night reading",
    description: "低亮度深色面板，适合夜间阅读。",
    descriptionEn: "Low-luminance dark panels for reading at night.",
    values: {
      ...NEUTRAL_PROFILE,
      readingWidth: 820,
      editingWidth: 860,
      lineHeight: 1.75,
      paragraphSpacing: 1.0,
      bgColor: "#12141a",
      textColor: "#d8dde6",
      mutedColor: "#8b93a3",
      accentColor: "#6ea8fe",
    },
  },
  {
    key: "glass",
    name: "半透明玻璃",
    nameEn: "Frosted glass",
    description: "面板半透明加背景模糊，配背景图效果最好。",
    descriptionEn: "Translucent panels with background blur; best with a wallpaper.",
    values: {
      ...NEUTRAL_PROFILE,
      readingWidth: 900,
      editingWidth: 940,
      lineHeight: 1.75,
      bgColor: "#1b1d24",
      bgOpacity: 0.72,
      panelOpacity: 0.5,
      blur: 12,
      textColor: "#e6e9ef",
      mutedColor: "#9aa3b2",
      accentColor: "#7cc4ff",
    },
  },
];

export function clonePreset(preset: Preset): ProfileDraft {
  return { ...preset.values };
}
