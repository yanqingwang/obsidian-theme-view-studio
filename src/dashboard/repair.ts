/**
 * data.json 的清洗与修复。
 *
 * 存在的理由很具体：`loadSettings()` 是浅合并，旧用户的 data.json 里根本没有
 * `dashboard` 字段，而用户也可能手改过它。任何一个字段类型不对、某块类型是
 * 未来版本写的、id 重复，都不该让插件加载失败 —— 首页面开不出来是最容易被察觉
 * 的故障。所以这里对未知类型宁可**丢掉那一块**，也不整体崩。
 *
 * 同样刻意不 import `obsidian`：纯函数才能在 node 里直接测（tests/repair.test.mjs）。
 */

import type { DashboardBlock, DashboardBlockType, DashboardSettings } from "../types";
import { DEFAULT_BLOCK_CONFIG, DEFAULT_DASHBOARD_SETTINGS } from "../types";
import { clampInt, DASHBOARD_GRIDS, DEFAULT_GRID_ID } from "./grid";

const KNOWN_TYPES: DashboardBlockType[] = [
  "github-file",
  "stats",
  "note-field",
  "dataview",
  "embed-note",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** 短id，够用且不依赖 crypto。 */
export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function repairBlock(raw: unknown, seen: Set<string>): DashboardBlock | null {
  if (!isRecord(raw)) return null;
  const type = str(raw.type, "");
  if (!KNOWN_TYPES.includes(type as DashboardBlockType)) return null; // 未来版本写的块：丢掉

  const id = str(raw.id, "");
  const blockId = id && !seen.has(id) ? id : newId();
  seen.add(blockId);

  const base = {
    id: blockId,
    size: clampInt(raw.size, 1, 8, 1),
    title: str(raw.title, ""),
    showTitle: bool(raw.showTitle, true),
  };

  // 每类积木的默认配置垫底，再用存盘值逐字段覆盖 —— 这样以后新增字段时，
  // 老用户的 data.json 也能自动补上，不用写迁移。
  const defaults = DEFAULT_BLOCK_CONFIG[type as DashboardBlockType] as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (key in raw) merged[key] = raw[key];
  }

  switch (type as DashboardBlockType) {
    case "github-file":
      return {
        ...base,
        type: "github-file",
        owner: str(merged.owner, ""),
        repo: str(merged.repo, ""),
        branch: str(merged.branch, "") || "main",
        path: str(merged.path, ""),
        token: str(merged.token, ""),
        intervalMin: clampInt(merged.intervalMin, 0, 1440, 60),
        renderMode: oneOf(merged.renderMode, ["auto", "text", "markdown"] as const, "auto"),
        maxChars: clampInt(merged.maxChars, 0, 200000, 2000),
      };
    case "stats":
      return {
        ...base,
        type: "stats",
        stat: oneOf(
          merged.stat,
          [
            "note-count",
            "folder-count",
            "modified-today",
            "created-today",
            "recent-notes",
            "word-count",
            "char-count",
            "untagged-count",
          ] as const,
          "note-count",
        ),
        folder: str(merged.folder, ""),
        limit: clampInt(merged.limit, 1, 50, 5),
      };
    case "note-field":
      return {
        ...base,
        type: "note-field",
        notePath: str(merged.notePath, ""),
        field: str(merged.field, ""),
        template: str(merged.template, "") || "{{value}}",
        fallback: str(merged.fallback, ""),
      };
    case "dataview":
      return {
        ...base,
        type: "dataview",
        mode: oneOf(merged.mode, ["query", "dataviewjs", "literal"] as const, "query"),
        source: str(merged.source, ""),
        basePath: str(merged.basePath, ""),
        refreshOnChange: bool(merged.refreshOnChange, true),
      };
    case "embed-note":
      return {
        ...base,
        type: "embed-note",
        notePath: str(merged.notePath, ""),
        mode: oneOf(merged.mode, ["card", "inline"] as const, "card"),
        summaryChars: clampInt(merged.summaryChars, 0, 5000, 160),
        useFrontmatterCover: bool(merged.useFrontmatterCover, true),
      };
    default:
      return null;
  }
}

/**
 * 把存盘值修成一个可用的 DashboardSettings。
 *
 * 绝不抛异常：任何奇怪的输入都退回到默认设置 + 能 salvage 的积木。
 */
export function repairDashboardSettings(stored: unknown): DashboardSettings {
  if (!isRecord(stored)) return cloneDefaults();

  const gridId = DASHBOARD_GRIDS.some((g) => g.id === stored.gridId)
    ? (stored.gridId as string)
    : DEFAULT_GRID_ID;

  const blocks: DashboardBlock[] = [];
  const seen = new Set<string>();
  if (Array.isArray(stored.blocks)) {
    for (const raw of stored.blocks) {
      const block = repairBlock(raw, seen);
      if (block) blocks.push(block);
    }
  }

  return {
    enabled: bool(stored.enabled, DEFAULT_DASHBOARD_SETTINGS.enabled),
    gridId,
    gap: clampInt(stored.gap, 0, 24, DEFAULT_DASHBOARD_SETTINGS.gap),
    openOnStartup: bool(stored.openOnStartup, DEFAULT_DASHBOARD_SETTINGS.openOnStartup),
    intervalMin: clampInt(stored.intervalMin, 1, 60, DEFAULT_DASHBOARD_SETTINGS.intervalMin),
    githubToken: str(stored.githubToken, ""),
    blocks,
  };
}

export function cloneDefaults(): DashboardSettings {
  return { ...DEFAULT_DASHBOARD_SETTINGS, blocks: [] };
}