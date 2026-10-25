/**
 * 嵌入笔记积木：卡片（标题 / 摘要 / 封面）或内嵌正文。
 *
 * 正文走 MarkdownRenderer 而不是 innerHTML —— 这是必须的：笔记内容是不可信输入，
 * 而且渲染器会把内部链接、嵌入、frontmatter 解析成真正可点的样子。
 */

import { MarkdownRenderer, TFile } from "obsidian";
import type { EmbedNoteBlock } from "../../types";
import type { BlockRenderer } from "../types";
import { toImageUrl } from "../../imageUrl";
import { tr } from "../../i18n";

function resolveNote(ctx: { app: import("obsidian").App }, notePath: string): TFile | null {
  const path = notePath.trim();
  if (!path) return null;
  const file = ctx.app.vault.getAbstractFileByPath(path);
  if (file instanceof TFile) return file;
  if (!path.endsWith(".md")) {
    const alt = ctx.app.vault.getAbstractFileByPath(`${path}.md`);
    if (alt instanceof TFile) return alt;
  }
  return null;
}

/** 第一段"像正文"的文字：跳过标题、列表、引用、嵌入和 frontmatter。 */
function summaryOf(content: string, limit: number): string {
  const body = content.replace(/^---\n[\s\S]*?\n---\n?/, "");
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#") || line.startsWith(">") || line.startsWith("-") || line.startsWith("*")) continue;
    if (line.startsWith("![")) continue;
    const cleaned = line.replace(/!?\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, "$2").replace(/[*_`]/g, "").trim();
    if (!cleaned) continue;
    return cleaned.length > limit ? `${cleaned.slice(0, Math.max(1, limit - 1))}…` : cleaned;
  }
  return "";
}

export const embedNoteRenderer: BlockRenderer<EmbedNoteBlock> = {
  type: "embed-note",

  defaultTitle(block) {
    return block.notePath.trim() || tr("(no note)", "（未选择笔记）");
  },

  intervalMinutes(block) {
    return block.mode === "inline" ? 10 : 15;
  },

  async render(ctx) {
    const { block, containerEl, app, component } = ctx;

    if (!block.notePath.trim()) {
      ctx.setStatus({
        kind: "empty",
        message: tr("Choose a note in settings.", "请在设置里选择一篇笔记。"),
      });
      return;
    }

    const file = resolveNote(ctx, block.notePath);
    if (!file) {
      const name = block.notePath.trim();
      ctx.setStatus({
        kind: "empty",
        message: tr("Note not found: ", "找不到笔记：") + name,
      });
      return;
    }

    const cache = app.metadataCache.getFileCache(file);
    const title =
      (cache?.frontmatter?.title as string | undefined)?.trim() || file.basename;

    if (block.mode === "inline") {
      if (block.size <= 1) {
        // 1 格的内嵌正文几乎必然溢出，如实提示而不是给一个卡死的视图。
        ctx.setStatus({
          kind: "empty",
          message: tr(
            "Inline content needs a block of 2 cells or more.",
            "内嵌正文请把积木调到2 格以上。",
          ),
        });
        return;
      }
      const content = await app.vault.cachedRead(file);
      const sub = containerEl.createDiv({ cls: "ts-dash-embed" });
      await MarkdownRenderer.render(app, content, sub, file.path, component);
      ctx.setStatus({ kind: "ok" });
      return;
    }

    const card = containerEl.createDiv({ cls: "ts-dash-card" });

    const coverField = (cache?.frontmatter?.cover ?? cache?.frontmatter?.image) as
      | string
      | undefined;
    if (block.useFrontmatterCover && typeof coverField === "string" && coverField.trim()) {
      const url = toImageUrl(app, coverField.trim());
      if (url) {
        card.createDiv({ cls: "ts-dash-cover" }).createEl("img", {
          cls: "ts-dash-cover-img",
          attr: { src: url, alt: "", loading: "lazy" },
        });
      }
    }

    const body = card.createDiv({ cls: "ts-dash-card-body" });
    const link = body.createEl("a", { cls: "ts-dash-card-title", href: "#", text: title });
    link.addEventListener("click", (ev) => {
      ev.preventDefault();
      void app.workspace.getLeaf(false).openFile(file);
    });

    const content = await app.vault.cachedRead(file);
    const summary = summaryOf(content, Math.max(0, block.summaryChars));
    if (summary) body.createDiv({ cls: "ts-dash-card-summary", text: summary });

    ctx.setStatus({ kind: "ok" });
  },
};