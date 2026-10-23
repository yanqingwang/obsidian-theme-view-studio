/**
 * 笔记属性积木：从某篇笔记的 frontmatter 取一个任意键。
 *
 * 刻意做成完全通用 —— 不预设 status/due 这类字段。这个库里due: 根本不存在、
 * status: 只有两篇笔记，按固定 schema 写会几乎永远取不到东西。
 */

import type { App, TFile } from "obsidian";
import type { NoteFieldBlock } from "../../types";
import type { BlockRenderer } from "../types";
import { tr } from "../../i18n";

/** frontmatter 值可能是 string / number / boolean / string[] / Date，统一成可显示文本。 */
export function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map((v) => formatFieldValue(v)).filter(Boolean).join(", ");
  if (value instanceof Date) return value.toLocaleDateString();
  if (typeof value === "object") {
    // 嵌套对象（如 Books/ 里的 chapters 列表）转成 JSON，比"[object Object]"可用。
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function resolveNote(app: App, notePath: string): TFile | null {
  const path = notePath.trim();
  if (!path) return app.workspace.getActiveFile();
  const file = app.vault.getAbstractFileByPath(path);
  if (file && "extension" in file) return file as TFile;
  // 没写 .md 后缀时也试一次，省得用户为了路径格式纠结。
  if (!path.endsWith(".md")) {
    const alt = app.vault.getAbstractFileByPath(`${path}.md`);
    if (alt && "extension" in alt) return alt as TFile;
  }
  return null;
}

export const noteFieldRenderer: BlockRenderer<NoteFieldBlock> = {
  type: "note-field",

  defaultTitle(block) {
    const field = block.field.trim() || tr("(no field)", "（未设置字段）");
    return field;
  },

  intervalMinutes() {
    return 5;
  },

  async render(ctx) {
    const { block, containerEl, app } = ctx;

    if (!block.field.trim()) {
      ctx.setStatus({
        kind: "empty",
        message: tr("Pick a frontmatter field in settings.", "请在设置里选择要取的字段。"),
      });
      return;
    }

    const file = resolveNote(app, block.notePath);
    if (!file) {
      const name = block.notePath.trim() || tr("the current note", "当前笔记");
      ctx.setStatus({
        kind: "empty",
        message: tr("Note not found: ", "找不到笔记：") + name,
      });
      return;
    }

    const cache = app.metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter;
    if (!frontmatter) {
      ctx.setStatus({
        kind: "empty",
        message: tr("This note has no frontmatter.", "这篇笔记没有 frontmatter。"),
      });
      return;
    }

    const raw = frontmatter[block.field.trim()];
    if (raw === undefined || raw === null || raw === "") {
      const fallback = block.fallback.trim();
      if (fallback) {
        containerEl.createDiv({ cls: "ts-dash-field", text: fallback });
        ctx.setStatus({ kind: "ok" });
      } else {
        ctx.setStatus({
          kind: "empty",
          message:
            tr("No ", "这篇笔记里没有 ") +
            block.field.trim() +
            tr(" in ", "（") +
            file.basename +
            tr(".", "）"),
        });
      }
      return;
    }

    const value = formatFieldValue(raw);
    const text = renderTemplate(block.template, {
      value,
      note: file.basename,
      modified: formatDate(file.stat.mtime),
    });

    const el = containerEl.createDiv({ cls: "ts-dash-field" });
    if (block.field.trim().length > 0) el.setAttribute("data-field", block.field.trim());
    el.setText(text);
    ctx.setStatus({ kind: "ok" });
  },
};

/** 简单占位符替换：{{value}} / {{note}} / {{modified}}。未知占位符原样保留，拼错时能看出来。 */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  const tpl = template.trim() || "{{value}}";
  return tpl.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match,
  );
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}