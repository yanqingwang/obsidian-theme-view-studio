/**
 * Dataview 对接。
 *
 * 这个文件是整个插件里唯一越出 Obsidian 公共类型的地方（`app.plugins` 不在类型里），
 * 所以所有 cast 都收在这里，别处保持干净。
 *
 * 已核验的入口（dataview 0.5.68）：`app.plugins.plugins.dataview.api` 与
 * `window.DataviewAPI` 都指向同一个 api 对象；索引是异步就绪的，触发方式是
 * `metadataCache.trigger("dataview:index-ready")`。这是私有 API，没有稳定性承诺，
 * 所以全程特性探测，缺失一律当正常状态处理。
 */

import type { App, Component, EventRef } from "obsidian";
import type { DataviewMode } from "../types";

export interface DataviewApiLike {
  index?: { initialized?: boolean; revision?: number };
}

interface PluginRegistry {
  plugins?: Record<string, { api?: unknown }>;
}

export function getDataviewApi(app: App): DataviewApiLike | null {
  const registry = (app as unknown as { plugins?: PluginRegistry }).plugins;
  const viaApp = registry?.plugins?.["dataview"]?.api as DataviewApiLike | undefined;
  if (viaApp) return viaApp;
  const viaWindow = (window as unknown as { DataviewAPI?: DataviewApiLike }).DataviewAPI;
  return viaWindow ?? null;
}

export function isIndexReady(api: DataviewApiLike | null): boolean {
  return api?.index?.initialized === true;
}

/**
 * 等索引就绪。
 *
 * 事件订阅 + 有界轮询两条腿：视图可能在 "dataview:index-ready" 已经触发之后才打开，
 * 只订阅事件会永远等不到（这是真实竞态，不是理论问题）。轮询上限 30 秒。
 */
export function whenIndexReady(
  app: App,
  component: Component,
  onReady: () => void,
  timeoutMs = 30_000,
): void {
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    window.clearInterval(timer);
    onReady();
  };

  const trigger = "dataview:index-ready";
  const ref = (
    app.metadataCache as unknown as {
      on(name: string, cb: () => void, ctx?: unknown): EventRef;
    }
  ).on(trigger, finish, component);
  // registerEvent（不是 register）：metadataCache 的 on 返回 EventRef。
  component.registerEvent(ref);
  // 索引早就绪过的情况：事件不会再响，轮询兜底（第一次 tick 就会命中）。
  const timer = window.setInterval(() => {
    if (isIndexReady(getDataviewApi(app))) finish();
  }, 1000);
  component.register(() => window.clearInterval(timer));

  if (timeoutMs > 0) {
    window.setTimeout(() => {
      if (isIndexReady(getDataviewApi(app))) finish();
    }, timeoutMs);
  }
}

/**
 * 把设置里的 mode + source 组成交给 MarkdownRenderer 的 markdown。
 *
 * 三种模式都走同一条渲染路径：`dataviewjs` 只有真实的代码块后处理器能执行，
 * 没有 API 能替你跑一段 JS；而 Dataview 自己产出的 markdown 已经把 Link、日期、
 * 时长这些格式化好了（手写格式化会把 Link 变成 [object Object]）。
 */
export function buildMarkdown(mode: DataviewMode, source: string): string {
  const body = source.replace(/\s+$/, "");
  if (mode === "query") return "```dataview\n" + body + "\n```";
  if (mode === "dataviewjs") return "```dataviewjs\n" + body + "\n```";
  return body;
}