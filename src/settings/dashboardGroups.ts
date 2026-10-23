/**
 * 主页相关的设置分组。
 *
 * 单独一个文件是为了不给已经 600 多行的 SettingsTab 继续加重量 —— 这里只负责
 * "长什么样"，取值/赋值仍在 SettingsTab 里（它才是唯一知道 key 约定的地方）。
 *
 * 关键约定：积木的 key 用**稳定 id**（`block.<id>.<field>`），不用下标。因为积木列表
 * 可排序、可删除，下标键会在"渲染时"和"用户点的时候"之间指向不同的块。
 */

import {
  Notice,
  Setting,
  type SettingDefinitionItem,
  type SettingGroupItem,
} from "obsidian";
import type ThemeStudioPlugin from "../main";
import type {
  DashboardBlock,
  DashboardBlockType,
  DashboardSettings,
  DataviewBlock,
  EmbedNoteBlock,
  GithubFileBlock,
  NoteFieldBlock,
  StatsBlock,
} from "../types";
import { DEFAULT_BLOCK_CONFIG } from "../types";
import { DASHBOARD_GRIDS, getGrid, maxBlockSize } from "../dashboard/grid";
import { BLOCK_TYPES, blockTypeLabel, defaultTitleFor } from "../dashboard/registry";
import { STAT_LABELS } from "../dashboard/stats";
import { newId } from "../dashboard/repair";
import { tr } from "../i18n";

/** 临时 UI 状态：正在编辑哪一块，以及"添加积木"表单里的待提交值。都不是插件设置。 */
export interface DashboardEditorState {
  editingBlockId: string;
  pendingType: DashboardBlockType;
  pendingSize: number;
  pendingTitle: string;
}

export interface DashboardGroupsHost {
  plugin: ThemeStudioPlugin;
  editor: DashboardEditorState;
  openDashboard(): void;
}

export function blockFieldKey(blockId: string, field: string): string {
  return `block.${blockId}.${field}`;
}

/** SettingsTab 用它把 `block.<id>.<field>` 解析回具体积木。 */
export function resolveBlockKey(
  blocks: DashboardBlock[],
  key: string,
): { block: DashboardBlock; field: string } | null {
  if (!key.startsWith("block.")) return null;
  const rest = key.slice("block.".length);
  const dot = rest.indexOf(".");
  if (dot < 0) return null;
  const blockId = rest.slice(0, dot);
  const field = rest.slice(dot + 1);
  const block = blocks.find((b) => b.id === blockId);
  return block ? { block, field } : null;
}

/** 按类型新建一块，配置字段取该类型的默认值。 */
export function makeBlock(type: DashboardBlockType, size: number, title: string): DashboardBlock {
  const defaults = DEFAULT_BLOCK_CONFIG[type] as Record<string, unknown>;
  return { id: newId(), type, size, title, showTitle: true, ...defaults } as DashboardBlock;
}

export function dashboardGroups(host: DashboardGroupsHost): SettingDefinitionItem[] {
  const settings = host.plugin.settings.dashboard;
  const editing = settings.blocks.find((b) => b.id === host.editor.editingBlockId) ?? null;
  return [
    mainGroup(host, settings),
    blocksList(host, settings),
    addBlockGroup(host, settings),
    ...(editing ? editorGroups(host, settings, editing) : []),
  ];
}

// ── 主页总开关 ────────────────────────────────────────────────────────────────

function mainGroup(host: DashboardGroupsHost, settings: DashboardSettings): SettingDefinitionItem {
  return {
    type: "group",
    heading: tr("Dashboard", "主页"),
    items: [
      {
        name: tr("Enable the dashboard", "启用主页"),
        desc: tr(
          'Adds a dashboard tab you can open with the "Open dashboard" command. Nothing shows up until you turn this on.',
          "启用后可以用命令打开主页标签页。不开这个开关，插件不会多出任何界面。",
        ),
        control: { type: "toggle", key: "dashboard.enabled", defaultValue: settings.enabled },
      },
      {
        name: tr("Grid", "网格"),
        desc: tr(
          "How many cells the screen is divided into. A block may take 1 to 8 cells, but never more than half of the total.",
          "屏幕被分成多少个格子。单块可占 1 到 8 格，但不超过总格子数的一半。",
        ),
        control: {
          type: "dropdown",
          key: "dashboard.gridId",
          options: Object.fromEntries(
            DASHBOARD_GRIDS.map((g) => [
              g.id,
              tr(`${g.columns} × ${g.rows} · ${g.n} cells`, `${g.columns} × ${g.rows} · ${g.n} 格`),
            ]),
          ),
          defaultValue: settings.gridId,
        },
      },
      {
        name: tr("Gap between blocks", "积木间距"),
        desc: tr("Space between blocks, in pixels.", "积木之间的间距（像素）。"),
        control: {
          type: "slider",
          key: "dashboard.gap",
          min: 0,
          max: 24,
          step: 1,
          defaultValue: settings.gap,
          displayFormat: (v: number) => `${v}px`,
        },
      },
      {
        name: tr("Refresh check interval", "刷新检查间隔"),
        desc: tr(
          "How often the dashboard checks which blocks are due. A hidden tab does not refresh at all.",
          "多久检查一次哪些积木该刷新。标签页隐藏时完全不会刷新。",
        ),
        control: {
          type: "slider",
          key: "dashboard.intervalMin",
          min: 1,
          max: 60,
          step: 1,
          defaultValue: settings.intervalMin,
          displayFormat: (v: number) => tr(`${v} min`, `${v} 分钟`),
        },
      },
      {
        name: tr("Open on startup", "启动时自动打开"),
        desc: tr(
          "Open the dashboard when Obsidian starts. Off by default — on mobile, an auto-opened full-screen tab gets in the way on every launch.",
          "Obsidian 启动时自动打开主页。默认关闭 —— 手机上每次启动都自动弹出一个全屏标签页很打扰。",
        ),
        control: {
          type: "toggle",
          key: "dashboard.openOnStartup",
          defaultValue: settings.openOnStartup,
        },
      },
      {
        name: tr("GitHub token (optional)", "GitHub Token（可选）"),
        desc: tr(
          "Used by GitHub file blocks. It is stored in plaintext in data.json, which you probably sync — prefer a fine-grained read-only token, or leave this empty for public repos (60 requests per hour per IP).",
          "GitHub 文件积木用这个 Token。它会以明文存在 data.json 里，而这个文件多半会被同步 —— 请使用细粒度、只读的 Token；公开库可以留空（每 IP 每小时 60 次）。",
        ),
        control: {
          type: "text",
          key: "dashboard.githubToken",
          placeholder: "ghp_…",
          defaultValue: settings.githubToken,
        },
      },
      {
        name: tr("Open dashboard", "打开主页"),
        desc: tr("Show the dashboard tab right now.", "立刻显示主页标签页。"),
        render: (setting: Setting) => {
          setting.addButton((b) =>
            b
              .setButtonText(tr("Open", "打开"))
              .setDisabled(!settings.enabled)
              .onClick(() => host.openDashboard()),
          );
        },
      },
    ],
  };
}

// ── 积木列表 ──────────────────────────────────────────────────────────────────

function blocksList(host: DashboardGroupsHost, settings: DashboardSettings): SettingDefinitionItem {
  const cap = maxBlockSize(getGrid(settings.gridId));

  const items: SettingGroupItem[] = settings.blocks.map((block) => {
    const row: SettingGroupItem = {
      name: block.title.trim() || defaultTitleFor(block),
      desc:
        blockTypeLabel(block.type) +
        tr(" · ", " · ") +
        `${block.size}/${cap}` +
        tr(" cells", " 格") +
        (block.size > cap
          ? tr(` — over this grid's limit, shown as ${cap}`, ` —— 超过当前网格上限，实际按 ${cap} 格显示`)
          : ""),
      aliases: ["edit", "configure", blockTypeLabel(block.type)],
      render: (setting: Setting) => {
        setting.addButton((b) =>
          b
            .setButtonText(tr("Edit", "编辑"))
            .onClick(() => {
              host.editor.editingBlockId = block.id;
              host.plugin.persist();
            }),
        );
      },
    };
    return row;
  });

  return {
    type: "list",
    heading: tr("Dashboard blocks", "主页积木"),
    emptyState: tr("No blocks yet — add one below.", "还没有积木，请在下方添加。"),
    items,
    onDelete: (index: number) => {
      const [removed] = settings.blocks.splice(index, 1);
      if (removed && host.editor.editingBlockId === removed.id) {
        host.editor.editingBlockId = settings.blocks[0]?.id ?? "";
      }
      void host.plugin.persist();
    },
    onReorder: (oldIndex: number, newIndex: number) => {
      const [moved] = settings.blocks.splice(oldIndex, 1);
      if (moved) settings.blocks.splice(newIndex, 0, moved);
      void host.plugin.persist();
    },
  };
}

// ── 添加积木 ──────────────────────────────────────────────────────────────────

function addBlockGroup(host: DashboardGroupsHost, settings: DashboardSettings): SettingDefinitionItem {
  const cap = maxBlockSize(getGrid(settings.gridId));
  return {
    type: "group",
    heading: tr("Add block", "添加积木"),
    items: [
      {
        name: tr("Block type", "积木类型"),
        desc: tr("What this block shows.", "这块积木显示什么内容。"),
        control: {
          type: "dropdown",
          key: "dashboard.newBlock.type",
          options: Object.fromEntries(
            BLOCK_TYPES.map((t) => [t.type, tr(t.label.en, t.label.zh)]),
          ),
          defaultValue: host.editor.pendingType,
        },
      },
      {
        name: tr("Size in cells", "占用格数"),
        desc: tr(
          `How many cells this block takes. At most half of the grid, so ${cap} for the current grid.`,
          `这块占几个格子。最多为网格的一半，当前网格下是 ${cap}。`,
        ),
        control: {
          type: "slider",
          key: "dashboard.newBlock.size",
          min: 1,
          max: Math.max(1, cap),
          step: 1,
          defaultValue: Math.min(host.editor.pendingSize, cap),
          displayFormat: (v: number) => `${v}`,
        },
      },
      {
        name: tr("Title (optional)", "标题（可选）"),
        desc: tr("Leave empty to use a default title.", "留空则使用默认标题。"),
        control: {
          type: "text",
          key: "dashboard.newBlock.title",
          placeholder: tr("e.g. Reading list", "例如：阅读清单"),
          defaultValue: host.editor.pendingTitle,
        },
      },
      {
        name: tr("Add block", "添加积木"),
        desc: tr(
          "Creates the block with the type, size and title above. You can fine-tune everything afterwards.",
          "按上面选的类型、大小和标题创建这块积木，之后可以继续微调每一项。",
        ),
        render: (setting: Setting) => {
          setting.addButton((b) =>
            b
              .setCta()
              .setButtonText(tr("Add", "添加"))
              .onClick(() => void addPendingBlock(host, settings, cap)),
          );
        },
      },
    ],
  };
}

async function addPendingBlock(
  host: DashboardGroupsHost,
  settings: DashboardSettings,
  cap: number,
): Promise<void> {
  const type = host.editor.pendingType;
  if (!BLOCK_TYPES.some((t) => t.type === type)) {
    new Notice(tr("Pick a block type first.", "请先选择积木类型。"));
    return;
  }
  const size = Math.min(Math.max(1, Math.trunc(host.editor.pendingSize) || 1), Math.max(1, cap));
  settings.blocks.push(makeBlock(type, size, host.editor.pendingTitle.trim()));
  host.editor.pendingTitle = "";
  host.editor.editingBlockId = settings.blocks[settings.blocks.length - 1].id;
  await host.plugin.persist();
}

// ── 编辑某一块 ────────────────────────────────────────────────────────────────

function editorGroups(
  host: DashboardGroupsHost,
  settings: DashboardSettings,
  block: DashboardBlock,
): SettingDefinitionItem[] {
  const cap = maxBlockSize(getGrid(settings.gridId));
  const key = (field: string) => blockFieldKey(block.id, field);

  const common: SettingGroupItem[] = [
    {
      name: tr("Title", "标题"),
      desc: tr("Shown at the top of the block. Empty uses a default.", "显示在积木顶部。留空则用默认标题。"),
      control: { type: "text", key: key("title"), defaultValue: block.title },
    },
    {
      name: tr("Show title", "显示标题"),
      desc: tr("Turn off to show the content only.", "关掉就只显示内容。"),
      control: { type: "toggle", key: key("showTitle"), defaultValue: block.showTitle },
    },
    {
      name: tr("Size in cells", "占用格数"),
      desc: tr(
        `1 to ${cap} for the current grid. A single block can never take more than half of it.`,
        `当前网格下是 1 到 ${cap} 格。单块永远不超过网格的一半。`,
      ),
      control: {
        type: "slider",
        key: key("size"),
        min: 1,
        max: Math.max(1, cap),
        step: 1,
        defaultValue: block.size,
        displayFormat: (v: number) => `${v}`,
      },
    },
  ];

  const typed = typedGroups(block, key);

  return [
    {
      type: "group",
      heading: tr("Block", "积木"),
      items: common,
    },
    ...typed,
    {
      type: "group",
      heading: tr("Block actions", "积木操作"),
      items: [
        {
          name: tr("Stop editing this block", "结束编辑这块"),
          desc: tr("Close the settings below.", "收起下面的设置。"),
          render: (setting: Setting) => {
            setting.addButton((b) =>
              b.setButtonText(tr("Done", "完成")).onClick(() => {
                host.editor.editingBlockId = "";
                void host.plugin.persist();
              }),
            );
          },
        },
      ],
    },
  ];
}

function typedGroups(
  block: DashboardBlock,
  key: (field: string) => string,
): SettingDefinitionItem[] {
  switch (block.type) {
    case "stats":
      return [statsGroup(block as StatsBlock, key)];
    case "note-field":
      return [noteFieldGroup(block as NoteFieldBlock, key)];
    case "embed-note":
      return [embedGroup(block as EmbedNoteBlock, key)];
    case "github-file":
      return [githubGroup(block as GithubFileBlock, key)];
    case "dataview":
      return [dataviewGroup(block as DataviewBlock, key)];
    default:
      // 类型集合是封闭的，理论到不了这里；真到了就交给分发器显示"未知类型"。
      return [];
  }
}

function statsGroup(block: StatsBlock, key: (f: string) => string): SettingDefinitionItem {
  const needsFolder = block.stat === "folder-count" ||
    block.stat === "modified-today" ||
    block.stat === "created-today" ||
    block.stat === "untagged-count" ||
    block.stat === "word-count" ||
    block.stat === "char-count";
  return {
    type: "group",
    heading: tr("Statistics", "统计内容"),
    items: [
      {
        name: tr("What to count", "统计什么"),
        desc: tr("Pick the statistic this block shows.", "选择这块要显示的统计项。"),
        control: {
          type: "dropdown",
          key: key("stat"),
          options: Object.fromEntries(
            (Object.keys(STAT_LABELS) as (keyof typeof STAT_LABELS)[]).map((k) => [
              k,
              tr(STAT_LABELS[k].en, STAT_LABELS[k].zh),
            ]),
          ),
          defaultValue: block.stat,
        },
      },
      {
        name: tr("Folder", "文件夹"),
        desc: tr(
          "Limit the statistic to this folder. Leave empty for the whole vault.",
          "把统计范围限制在这个文件夹。留空表示整个库。",
        ),
        visible: () => needsFolder,
        control: {
          type: "folder",
          key: key("folder"),
          placeholder: tr("e.g. AIReports", "例如 AIReports"),
          includeRoot: true,
          defaultValue: block.folder,
        },
      },
      {
        name: tr("How many notes", "显示条数"),
        desc: tr("Only used by “Recently modified notes”.", "只有「最近修改的笔记」这一项会用。"),
        visible: () => block.stat === "recent-notes",
        control: {
          type: "slider",
          key: key("limit"),
          min: 1,
          max: 30,
          step: 1,
          defaultValue: block.limit,
          displayFormat: (v: number) => `${v}`,
        },
      },
    ],
  };
}

function noteFieldGroup(block: NoteFieldBlock, key: (f: string) => string): SettingDefinitionItem {
  return {
    type: "group",
    heading: tr("Note field", "笔记属性"),
    items: [
      {
        name: tr("Note", "笔记"),
        desc: tr(
          "Which note to read. Leave empty for whichever note is open.",
          "读哪篇笔记。留空表示当前打开的那篇。",
        ),
        control: {
          type: "text",
          key: key("notePath"),
          placeholder: tr("e.g. Daily 思考/2026-01-01", "例如 Daily 思考/2026-01-01"),
          defaultValue: block.notePath,
        },
      },
      {
        name: tr("Field", "字段"),
        desc: tr(
          "Any frontmatter key, exactly as written in the note (case sensitive). Not every note has one — that is normal, the block will say so.",
          "任意 frontmatter 字段名，与笔记里写的完全一致（区分大小写）。并不是每篇笔记都有 —— 这是正常的，积木会如实说明。",
        ),
        control: {
          type: "text",
          key: key("field"),
          placeholder: "status",
          defaultValue: block.field,
        },
      },
      {
        name: tr("Template", "模板"),
        desc: tr(
          "Placeholders: {{value}} (the field), {{note}} (note name), {{modified}} (date).",
          "可用占位符：{{value}}（字段值）、{{note}}（笔记名）、{{modified}}（日期）。",
        ),
        control: { type: "text", key: key("template"), defaultValue: block.template },
      },
      {
        name: tr("Fallback text", "兜底文案"),
        desc: tr(
          "Shown instead of an error when the field is missing. Leave empty to show a “field missing” note.",
          "字段缺失时显示这段文字。留空则显示“字段不存在”的提示。",
        ),
        control: { type: "text", key: key("fallback"), defaultValue: block.fallback },
      },
    ],
  };
}

function embedGroup(block: EmbedNoteBlock, key: (f: string) => string): SettingDefinitionItem {
  return {
    type: "group",
    heading: tr("Embedded note", "嵌入笔记"),
    items: [
      {
        name: tr("Note", "笔记"),
        desc: tr("The note to show.", "要显示的笔记。"),
        control: {
          type: "text",
          key: key("notePath"),
          placeholder: tr("e.g. AIReports/overview.md", "例如 AIReports/overview.md"),
          defaultValue: block.notePath,
        },
      },
      {
        name: tr("Mode", "模式"),
        desc: tr(
          "Card = title, summary and cover. Inline = the note content itself (needs 2 cells or more).",
          "卡片 = 标题、摘要和封面。内嵌 = 笔记正文（需要 2 格以上）。",
        ),
        control: {
          type: "dropdown",
          key: key("mode"),
          options: {
            card: tr("Card", "卡片"),
            inline: tr("Inline content", "内嵌正文"),
          },
          defaultValue: block.mode,
        },
      },
      {
        name: tr("Summary length", "摘要字数"),
        desc: tr("Characters of the first real paragraph.", "取第一段正文的字数。"),
        visible: () => block.mode === "card",
        control: {
          type: "slider",
          key: key("summaryChars"),
          min: 40,
          max: 600,
          step: 20,
          defaultValue: block.summaryChars,
          displayFormat: (v: number) => `${v}`,
        },
      },
      {
        name: tr("Use frontmatter cover", "使用 frontmatter 封面"),
        desc: tr("Show `cover` or `image` from the note's frontmatter as the card image.", "把笔记 frontmatter 里的 cover / image 作为卡片封面。"),
        visible: () => block.mode === "card",
        control: {
          type: "toggle",
          key: key("useFrontmatterCover"),
          defaultValue: block.useFrontmatterCover,
        },
      },
    ],
  };
}

function githubGroup(block: GithubFileBlock, key: (f: string) => string): SettingDefinitionItem {
  return {
    type: "group",
    heading: tr("GitHub file", "GitHub 文件"),
    items: [
      {
        name: tr("Owner", "Owner"),
        desc: tr("The user or organisation.", "用户或组织名。"),
        control: { type: "text", key: key("owner"), defaultValue: block.owner },
      },
      {
        name: tr("Repository", "仓库"),
        desc: tr("Repository name.", "仓库名。"),
        control: { type: "text", key: key("repo"), defaultValue: block.repo },
      },
      {
        name: tr("Branch", "分支"),
        desc: tr("Which branch to read.", "读取哪个分支。"),
        control: { type: "text", key: key("branch"), defaultValue: block.branch },
      },
      {
        name: tr("Path in repo", "仓库内路径"),
        desc: tr("e.g. versions.json or docs/guide.md.", "例如 versions.json 或 docs/guide.md。"),
        control: { type: "text", key: key("path"), defaultValue: block.path },
      },
      {
        name: tr("Render as", "渲染方式"),
        desc: tr(
          "Auto pretty-prints .json and renders anything else as markdown.",
          "自动：.json 美化输出，其余按 markdown 渲染。",
        ),
        control: {
          type: "dropdown",
          key: key("renderMode"),
          options: {
            auto: tr("Auto", "自动"),
            text: tr("Plain text", "纯文本"),
            markdown: tr("Markdown", "Markdown"),
          },
          defaultValue: block.renderMode,
        },
      },
      {
        name: tr("Truncate after", "截断长度"),
        desc: tr("Characters before the content is cut off. 0 = no limit.", "超过这个字符数就截断。0 = 不截断。"),
        control: {
          type: "slider",
          key: key("maxChars"),
          min: 0,
          max: 20000,
          step: 500,
          defaultValue: block.maxChars,
          displayFormat: (v: number) => (v === 0 ? tr("no limit", "不截断") : `${v}`),
        },
      },
      {
        name: tr("Refresh every", "刷新间隔"),
        desc: tr(
          "Minutes between fetches. Without a token the minimum is 5 minutes, because the anonymous GitHub API allows only 60 requests per hour.",
          "多少分钟拉取一次。没有 Token 时下限是 5 分钟 —— 匿名 GitHub API 每小时只允许 60 次。",
        ),
        control: {
          type: "slider",
          key: key("intervalMin"),
          min: 1,
          max: 1440,
          step: 1,
          defaultValue: block.intervalMin,
          displayFormat: (v: number) => (v === 0 ? tr("manual only", "仅手动") : tr(`${v} min`, `${v} 分钟`)),
        },
      },
      {
        name: tr("Token for this block", "本块的 Token"),
        desc: tr("Overrides the global token. Empty uses the global one.", "覆盖全局 Token。留空则用全局的。"),
        control: { type: "text", key: key("token"), placeholder: "ghp_…", defaultValue: block.token },
      },
    ],
  };
}

function dataviewGroup(block: DataviewBlock, key: (f: string) => string): SettingDefinitionItem {
  return {
    type: "group",
    heading: tr("Dataview", "Dataview"),
    items: [
      {
        name: tr("Mode", "模式"),
        desc: tr(
          "Query = a Dataview query. DataviewJS = JavaScript. Literal = plain markdown, rendered as-is.",
          "Query = Dataview 查询；DataviewJS = JavaScript；Literal = 原始 markdown，原样渲染。",
        ),
        control: {
          type: "dropdown",
          key: key("mode"),
          options: {
            query: tr("Query", "查询"),
            dataviewjs: tr("DataviewJS", "DataviewJS"),
            literal: tr("Plain markdown", "纯 Markdown"),
          },
          defaultValue: block.mode,
        },
      },
      {
        name: tr("Source", "内容"),
        desc: tr(
          "The query or script this block runs. Requires the Dataview plugin; without it the block says so instead of failing.",
          "这块执行的查询或脚本。需要安装 Dataview 插件；没装时积木会提示，而不是报错。",
        ),
        control: {
          type: "textarea",
          key: key("source"),
          rows: 6,
          defaultValue: block.source,
        },
      },
      {
        name: tr("Base path", "基准路径"),
        desc: tr("Resolves relative wikilinks. Empty = vault root.", "相对 wikilink 的解析基准。留空 = 库根。"),
        control: { type: "text", key: key("basePath"), defaultValue: block.basePath },
      },
      {
        name: tr("Refresh when the vault changes", "库变化时自动刷新"),
        desc: tr(
          "Re-run this block after edits elsewhere in the vault.",
          "库里其他地方被编辑后重新执行这块。",
        ),
        control: {
          type: "toggle",
          key: key("refreshOnChange"),
          defaultValue: block.refreshOnChange,
        },
      },
    ],
  };
}