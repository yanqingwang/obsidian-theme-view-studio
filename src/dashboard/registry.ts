/**
 * 积木渲染器注册表与分发器。
 *
 * 只有五种类型、用户不能扩展，所以用固定表而不是注册 API —— 少一层间接。
 * 健壮性集中在这个文件：任何一块抛错都只影响它自己，绝不把整个主页带崩。
 */

import type { DashboardBlock, DashboardBlockType } from "../types";
import type { AnyBlockRenderer, BlockRenderContext, BlockTypeInfo } from "./types";
import { statsRenderer } from "./blocks/StatsBlock";
import { noteFieldRenderer } from "./blocks/NoteFieldBlock";
import { embedNoteRenderer } from "./blocks/EmbedNoteBlock";
import { githubFileRenderer } from "./blocks/GithubBlock";
import { dataviewRenderer } from "./blocks/DataviewBlock";
import { tr } from "../i18n";

/** 渲染器表。写入侧是受控的常量，读取侧只在 block.type 与 key 严格相等时使用。 */
const RENDERERS: Partial<Record<DashboardBlockType, AnyBlockRenderer>> = {
  stats: statsRenderer,
  "note-field": noteFieldRenderer,
  "embed-note": embedNoteRenderer,
  "github-file": githubFileRenderer,
  dataview: dataviewRenderer,
};

export const BLOCK_TYPES: BlockTypeInfo[] = [
  { type: "stats", label: { en: "Vault statistics", zh: "库内统计" } },
  { type: "note-field", label: { en: "Note field", zh: "笔记属性" } },
  { type: "embed-note", label: { en: "Embedded note", zh: "嵌入笔记" } },
  { type: "github-file", label: { en: "GitHub file", zh: "GitHub 文件" } },
  { type: "dataview", label: { en: "Dataview", zh: "Dataview" } },
];

export function blockTypeLabel(type: string): string {
  const info = BLOCK_TYPES.find((t) => t.type === type);
  if (!info) return type;
  return tr(info.label.en, info.label.zh);
}

export function defaultTitleFor(block: DashboardBlock): string {
  const r = RENDERERS[block.type];
  return r ? r.defaultTitle(block) : blockTypeLabel(block.type);
}

export function intervalFor(block: DashboardBlock, settings: import("../types").DashboardSettings): number {
  const r = RENDERERS[block.type];
  const fallback = Math.max(1, settings.intervalMin);
  return r ? r.intervalMinutes(block, settings) : fallback;
}

function describeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return tr("Failed: ", "出错了：") + msg;
}

/** 渲染一块积木。异常在这里被吃掉，表现为该块显示错误状态。 */
export async function renderBlock(block: DashboardBlock, ctx: BlockRenderContext): Promise<void> {
  const renderer = RENDERERS[block.type];
  if (!renderer) {
    ctx.setStatus({
      kind: "error",
      message: tr("Unknown block type: ", "未知的积木类型：") + block.type,
    });
    return;
  }
  ctx.containerEl.empty();
  try {
    await renderer.render(ctx);
  } catch (err) {
    ctx.containerEl.empty();
    ctx.setStatus({ kind: "error", message: describeError(err) });
  }
}