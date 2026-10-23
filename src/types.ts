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

/* ── 主页（Dashboard）─────────────────────────────────────────────────────── */

export type DashboardBlockType =
  | "github-file"
  | "stats"
  | "note-field"
  | "dataview"
  | "embed-note";

/** 所有积木共有的字段。size = 占几个格子（1..8，且不超过网格格子数的一半）。 */
export interface DashboardBlockBase {
  id: string;
  type: DashboardBlockType;
  /** 占用的格子数。渲染时才会按当前网格二次夹紧，存储时保留用户原值。 */
  size: number;
  /** 自定义标题；空串表示用渲染器给的默认标题。 */
  title: string;
  showTitle: boolean;
}

/** 从 GitHub 仓库拉一个文件并展示。 */
export interface GithubFileBlock extends DashboardBlockBase {
  type: "github-file";
  owner: string;
  repo: string;
  branch: string;
  /** 仓库内路径，如 versions.json。 */
  path: string;
  /** 覆盖 dashboard.githubToken；空 = 用全局 token。 */
  token: string;
  /** 刷新间隔（分钟）。0 = 只手动刷新。渲染器会按有无 token 强制下限。 */
  intervalMin: number;
  renderMode: "auto" | "text" | "markdown";
  /** 超过这个字符数就截断；0 = 不截断。 */
  maxChars: number;
}

export type VaultStatKind =
  | "note-count"
  | "folder-count"
  | "modified-today"
  | "created-today"
  | "recent-notes"
  | "word-count"
  | "char-count"
  | "untagged-count";

/** 内置库统计。只用 vault + metadataCache（不依赖 Tasks 插件）。 */
export interface StatsBlock extends DashboardBlockBase {
  type: "stats";
  stat: VaultStatKind;
  /** folder-count 用的子目录；空 = 全库。 */
  folder: string;
  /** recent-notes 的条数；默认 5。 */
  limit: number;
}

/** 从某篇笔记的 frontmatter 取一个任意键。 */
export interface NoteFieldBlock extends DashboardBlockBase {
  type: "note-field";
  /** vault 相对路径；空 = 当前打开的笔记。 */
  notePath: string;
  /** 任意 frontmatter key —— 本库并没有统一 schema，所以这里不做任何假设。 */
  field: string;
  /** 模板：{{value}} {{note}} {{modified}}；未知占位符原样保留。 */
  template: string;
  /** 取不到值时的兜底文案，空 = 不显示。 */
  fallback: string;
}

export type DataviewMode = "query" | "dataviewjs" | "literal";

/** 交给 Dataview 渲染的查询块。 */
export interface DataviewBlock extends DashboardBlockBase {
  type: "dataview";
  mode: DataviewMode;
  /** query = DQL；dataviewjs = JS 源码；literal = 原始 markdown。 */
  source: string;
  /** 解析 wikilink 的基准路径；空 = 库根。 */
  basePath: string;
  /** 库变更后自动重渲；关掉则只按 intervalMin / 手动。 */
  refreshOnChange: boolean;
}

/** 展示某篇笔记的卡片或内嵌正文。 */
export interface EmbedNoteBlock extends DashboardBlockBase {
  type: "embed-note";
  notePath: string;
  mode: "card" | "inline";
  /** card 模式摘要字数上限。 */
  summaryChars: number;
  /** 优先读 frontmatter 的 cover / image 作为封面。 */
  useFrontmatterCover: boolean;
}

export type DashboardBlock =
  | GithubFileBlock
  | StatsBlock
  | NoteFieldBlock
  | DataviewBlock
  | EmbedNoteBlock;

export interface DashboardSettings {
  /** 总开关。默认关闭 —— 装上插件不会凭空多出一个标签页。 */
  enabled: boolean;
  /** 指向 DASHBOARD_GRIDS 的一项；加载时校验，失效回落到默认。 */
  gridId: string;
  /** 积木间距（px）。 */
  gap: number;
  openOnStartup: boolean;
  /** 调度器 tick 间隔（分钟），所有积木的到期判断都基于它。 */
  intervalMin: number;
  /** 全局 GitHub token。明文存 data.json —— UI 必须有警告文案。 */
  githubToken: string;
  blocks: DashboardBlock[];
}

export interface ThemeStudioSettings {
  schemaVersion: number;
  /** 未命中任何规则时使用的主题。 */
  defaultProfileId: string;
  profiles: ThemeProfile[];
  scopeRules: ScopeRule[];
  /** 状态栏显示当前生效的主题名。 */
  showStatusBar: boolean;
  /** 自定义主页（v1.3.0 起）。 */
  dashboard: DashboardSettings;
}

/** 每一类积木的默认配置，新增字段时只改这里。 */
export const DEFAULT_BLOCK_CONFIG: {
  "github-file": Omit<GithubFileBlock, keyof DashboardBlockBase>;
  stats: Omit<StatsBlock, keyof DashboardBlockBase>;
  "note-field": Omit<NoteFieldBlock, keyof DashboardBlockBase>;
  dataview: Omit<DataviewBlock, keyof DashboardBlockBase>;
  "embed-note": Omit<EmbedNoteBlock, keyof DashboardBlockBase>;
} = {
  "github-file": {
    owner: "yanqingwang",
    repo: "obsidian-theme-view-studio",
    branch: "main",
    path: "versions.json",
    token: "",
    intervalMin: 60,
    renderMode: "auto",
    maxChars: 2000,
  },
  stats: { stat: "note-count", folder: "", limit: 5 },
  "note-field": { notePath: "", field: "status", template: "{{value}}", fallback: "" },
  dataview: {
    mode: "query",
    source: 'LIST FROM "AITasks" SORT file.name ASC',
    basePath: "",
    refreshOnChange: true,
  },
  "embed-note": { notePath: "", mode: "card", summaryChars: 160, useFrontmatterCover: true },
};

export const DEFAULT_DASHBOARD_SETTINGS: DashboardSettings = {
  enabled: false,
  gridId: "3x2",
  gap: 12,
  openOnStartup: false,
  intervalMin: 15,
  githubToken: "",
  blocks: [],
};

export const DEFAULT_SETTINGS: ThemeStudioSettings = {
  schemaVersion: 2,
  // 与用户原先使用的 Wide View 主题（1400px）保持一致，装上后观感不变。
  defaultProfileId: "wide",
  profiles: [],
  scopeRules: [],
  showStatusBar: true,
  dashboard: DEFAULT_DASHBOARD_SETTINGS,
};
