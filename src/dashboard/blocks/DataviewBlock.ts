/**
 * Dataview 积木：把 query / dataviewjs / 纯 markdown 交给 Dataview 或渲染器执行。
 *
 * 两种"正常但不是内容"的状态值得当成一等公民：Dataview 没装、索引还没建好。
 * 两者都不是错误，块里显示提示即可；只有渲染真正抛错才算错误状态。
 */

import { MarkdownRenderer } from "obsidian";
import type { DataviewBlock } from "../../types";
import type { BlockRenderer } from "../types";
import { buildMarkdown, getDataviewApi, isIndexReady, whenIndexReady } from "../dataview";
import { tr } from "../../i18n";

export const dataviewRenderer: BlockRenderer<DataviewBlock> = {
  type: "dataview",

  defaultTitle(block) {
    if (block.mode === "dataviewjs") return tr("DataviewJS", "DataviewJS");
    return tr("Dataview", "Dataview");
  },

  intervalMinutes() {
    // 查询是本地计算；库没变时重复跑没有意义，靠 refreshOnChange 触发即可。
    return 10;
  },

  async render(ctx) {
    const { block, containerEl, app, component, basePath } = ctx;

    if (!block.source.trim()) {
      ctx.setStatus({
        kind: "empty",
        message: tr("Write a query in settings.", "请在设置里写查询内容。"),
      });
      return;
    }

    const paint = async () => {
      containerEl.empty();
      await MarkdownRenderer.render(
        app,
        buildMarkdown(block.mode, block.source),
        containerEl,
        block.basePath.trim() || basePath,
        component,
      );
    };

    // literal 模式是纯 markdown，不需要 Dataview。
    if (block.mode === "literal") {
      await paint();
      ctx.setStatus({ kind: "ok" });
      return;
    }

    const api = getDataviewApi(app);
    if (!api) {
      ctx.setStatus({
        kind: "empty",
        message: tr(
          "Dataview is not installed. Install and enable it, or switch this block to plain markdown.",
          "没有安装 Dataview 插件。装好并启用，或把这块改成纯 Markdown 模式。",
        ),
      });
      return;
    }

    if (!isIndexReady(api)) {
      ctx.setStatus({ kind: "empty", message: tr("Building the Dataview index…", "正在建立 Dataview 索引……") });
      whenIndexReady(app, component, () => {
        // 索引好了就补一次渲染；此时组件可能已卸载，render 会自行短路。
        void paint().then(() => ctx.setStatus({ kind: "ok" }));
      });
      return;
    }

    await paint();
    ctx.setStatus({ kind: "ok" });
  },
};