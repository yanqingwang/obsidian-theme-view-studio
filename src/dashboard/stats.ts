/**
 * 内置库统计。只依赖 vault + metadataCache —— 不假设装了 Tasks 之类的插件。
 */

import type { App, TFile } from "obsidian";
import type { StatsBlock } from "../types";
import { normalizeFolder } from "../ScopeResolver";
import { tr } from "../i18n";

export type StatValue =
  | { kind: "number"; value: number }
  | { kind: "list"; items: { title: string; path: string; mtime: number }[] };

function inFolder(file: TFile, folder: string): boolean {
  if (!folder) return true;
  return file.path === folder || file.path.startsWith(folder + "/");
}

/** 指定文件夹下的笔记；folder 为空时是全库。 */
function filesIn(app: App, folder: string): TFile[] {
  const all = app.vault.getMarkdownFiles();
  if (!folder) return all;
  return all.filter((f) => inFolder(f, folder));
}

function countIn(app: App, folder: string): number {
  return filesIn(app, folder).length;
}

/**
 * 中英混排的字数：CJK 按字算，其余按空白分词。
 *
 * 这个库以中文笔记为主，用 split(/\s+/) 会得到接近 0 的结果 —— 在英文测试里
 * 完全看不出来，但用户一眼就会发现数字不对。
 */
export function countWords(text: string): number {
  const cjk = text.match(/[぀-ヿ一-鿿豈-﫿]/g)?.length ?? 0;
  const latin = text
    .replace(/[぀-ヿ一-鿿豈-﫿]/g, " ")
    .match(/[A-Za-z0-9_'’-]+/g)?.length ?? 0;
  return cjk + latin;
}

function isUntagged(app: App, file: TFile): boolean {
  const cache = app.metadataCache.getFileCache(file);
  if (!cache) return true;
  // frontmatter 里的 tags 和行内标签是两套来源，两个都算上。
  const frontmatterTags = cache.frontmatter?.tags;
  if (Array.isArray(frontmatterTags) && frontmatterTags.length > 0) return false;
  if (typeof frontmatterTags === "string" && frontmatterTags.trim() !== "") return false;
  return !cache.tags || cache.tags.length === 0;
}

function isToday(ts: number): boolean {
  const d = new Date(ts);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export async function computeStat(app: App, block: StatsBlock): Promise<StatValue> {
  const folder = normalizeFolder(block.folder ?? "");

  switch (block.stat) {
    case "note-count": {
      // 笔记总数固定是全库的，不看 folder —— 否则两个选项会做成同一件事。
      return { kind: "number", value: app.vault.getMarkdownFiles().length };
    }

    case "folder-count": {
      if (!folder) return { kind: "list", items: [] }; // 没填文件夹，见 UI 提示
      return { kind: "number", value: countIn(app, folder) };
    }

    case "modified-today":
      return { kind: "number", value: filesIn(app, folder).filter((f) => isToday(f.stat.mtime)).length };

    case "created-today":
      return { kind: "number", value: filesIn(app, folder).filter((f) => isToday(f.stat.ctime)).length };

    case "untagged-count":
      return { kind: "number", value: filesIn(app, folder).filter((f) => isUntagged(app, f)).length };

    case "char-count": {
      let total = 0;
      for (const file of filesIn(app, folder)) {
        total += (await app.vault.cachedRead(file)).length;
      }
      return { kind: "number", value: total };
    }

    case "word-count": {
      let total = 0;
      for (const file of filesIn(app, folder)) {
        total += countWords(await app.vault.cachedRead(file));
      }
      return { kind: "number", value: total };
    }

    case "recent-notes": {
      const limit = Math.max(1, Math.min(50, Math.trunc(block.limit) || 5));
      const items = filesIn(app, folder)
        .sort((a, b) => b.stat.mtime - a.stat.mtime)
        .slice(0, limit)
        .map((f) => ({ title: app.metadataCache.fileToLinktext(f, ""), path: f.path, mtime: f.stat.mtime }));
      return { kind: "list", items };
    }

    default:
      return { kind: "number", value: app.vault.getMarkdownFiles().length };
  }
}

/** 统计项在设置页下拉里的双语名称。 */
export const STAT_LABELS: Record<StatsBlock["stat"], { en: string; zh: string }> = {
  "note-count": { en: "Notes in total", zh: "笔记总数" },
  "folder-count": { en: "Notes in a folder", zh: "某个文件夹的笔记数" },
  "modified-today": { en: "Notes modified today", zh: "今天修改过的笔记数" },
  "created-today": { en: "Notes created today", zh: "今天新建的笔记数" },
  "recent-notes": { en: "Recently modified notes", zh: "最近修改的笔记" },
  "word-count": { en: "Word count", zh: "总字数" },
  "char-count": { en: "Character count", zh: "总字符数" },
  "untagged-count": { en: "Notes without tags", zh: "没有标签的笔记数" },
};

export function statLabel(stat: StatsBlock["stat"]): string {
  const l = STAT_LABELS[stat];
  return tr(l.en, l.zh);
}