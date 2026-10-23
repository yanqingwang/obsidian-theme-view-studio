/** 内置库统计积木：一个数字，或最近修改的笔记列表。 */

import type { StatsBlock } from "../../types";
import type { BlockRenderer } from "../types";
import { computeStat, statLabel } from "../stats";
import { tr } from "../../i18n";

/** 大数字压缩显示：1234 → 1.2k，免得窄块里撑破；准数放在 aria-label 里。 */
function compactNumber(n: number): string {
  if (Math.abs(n) < 1000) return String(n);
  if (Math.abs(n) < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

export const statsRenderer: BlockRenderer<StatsBlock> = {
  type: "stats",

  defaultTitle(block) {
    return statLabel(block.stat);
  },

  intervalMinutes() {
    // 纯本地计算，跟着调度器的 tick 走就行，不需要单独的网络节奏。
    return 5;
  },

  async render(ctx) {
    const { block, containerEl } = ctx;

    if (block.stat === "folder-count" && !block.folder.trim()) {
      ctx.setStatus({
        kind: "empty",
        message: tr("Pick a folder in settings.", "请在设置里指定一个文件夹。"),
      });
      return;
    }

    const result = await computeStat(ctx.app, block);

    if (result.kind === "number") {
      const isTodayStat = block.stat === "modified-today" || block.stat === "created-today";
      if (result.value === 0 && isTodayStat) {
        ctx.setStatus({ kind: "empty", message: tr("Nothing today.", "今天没有。") });
        return;
      }
      const valueEl = containerEl.createDiv({ cls: "ts-dash-v ts-dash-v-big" });
      valueEl.setText(compactNumber(result.value));
      valueEl.setAttribute("aria-label", String(result.value));
      ctx.setStatus({ kind: "ok" });
      return;
    }

    if (result.items.length === 0) {
      ctx.setStatus({ kind: "empty", message: tr("No notes yet.", "还没有笔记。") });
      return;
    }

    const list = containerEl.createEl("ul", { cls: "ts-dash-list" });
    for (const item of result.items) {
      const li = list.createEl("li", { cls: "ts-dash-list-item" });
      const link = li.createEl("a", { cls: "ts-dash-list-link", href: "#", text: item.title });
      link.addEventListener("click", (ev) => {
        ev.preventDefault();
        void ctx.app.workspace.openLinkText(item.path, ctx.basePath, false);
      });
      li.createSpan({ cls: "ts-dash-list-time", text: formatDate(item.mtime) });
    }
    ctx.setStatus({ kind: "ok" });
  },
};

function formatDate(ts: number): string {
  const d = new Date(ts);
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}