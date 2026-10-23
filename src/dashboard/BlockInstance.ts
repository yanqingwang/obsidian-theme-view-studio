/**
 * 单个积木的运行时对象：自己的 DOM、自己的子 Component、以及刷新记账。
 *
 * 为什么要"子 Component"：MarkdownRenderer.render 会往 Component 上注册资源，
 * 把它挂成视图 Component 的子节点，积木重渲或视图关闭时资源自动释放。
 */

import { Component } from "obsidian";
import type { DashboardBlock } from "../types";
import type { BlockContextInput, BlockStatus, RefreshReason } from "./types";
import { renderBlock } from "./registry";
import { tr } from "../i18n";

export class BlockInstance {
  readonly el: HTMLElement;
  readonly bodyEl: HTMLElement;
  readonly headEl: HTMLElement;
  readonly titleEl: HTMLElement;

  /** 这块的子组件，卸载时连带清掉内部注册的 markdown 资源。 */
  private component = new Component();
  private status: BlockStatus = { kind: "ok" };
  /** 上一次刷新完成的时间（ms）。0 = 从未刷过。 */
  private lastRefreshedAt = 0;
  private refreshing = false;
  private disposed = false;

  constructor(
    block: DashboardBlock,
    title: string,
    showTitle: boolean,
    private readonly onManualRefresh: (block: DashboardBlock) => void,
  ) {
    this.el = createDiv({ cls: "ts-dash-block" });
    this.headEl = this.el.createDiv({ cls: "ts-dash-block-head" });
    this.titleEl = this.headEl.createSpan({ cls: "ts-dash-block-title" });
    this.titleEl.textContent = showTitle ? title : "";
    this.headEl.createEl("span", { cls: "ts-dash-block-stale", text: "" });
    this.headEl.createDiv({ cls: "ts-dash-block-actions" });

    const btn = this.headEl.createEl("button", {
      cls: "ts-dash-icon-btn",
      attr: { type: "button", "aria-label": tr("Refresh this block", "刷新这块") },
    });
    btn.textContent = "↻";
    btn.addEventListener("click", () => this.onManualRefresh(block));

    this.bodyEl = this.el.createDiv({ cls: "ts-dash-block-body" });
  }

  setTitle(title: string, showTitle: boolean): void {
    this.titleEl.textContent = showTitle ? title : "";
  }

  /** 状态只影响 body 底部的一行提示，不清空已有内容 —— stale 就靠这一点保留旧数据。 */
  setStatus(status: BlockStatus): void {
    if (this.disposed) return;
    this.status = status;

    let statusEl = this.bodyEl.querySelector<HTMLElement>(":scope > .ts-dash-status");
    const message = statusMessage(status);
    if (!message) {
      statusEl?.remove();
      return;
    }
    if (!statusEl) {
      statusEl = this.bodyEl.createDiv({ cls: "ts-dash-status" });
    }
    statusEl.setText(message);
    statusEl.setAttribute("data-kind", status.kind);

    const stale = this.headEl.querySelector<HTMLElement>(".ts-dash-block-stale");
    if (stale) {
      const showStale = status.kind === "stale";
      stale.textContent = showStale ? tr("stale", "过期") : "";
      stale.toggleClass("is-visible", showStale);
    }
  }

  get lastRefresh(): number {
    return this.lastRefreshedAt;
  }

  get isRefreshing(): boolean {
    return this.refreshing;
  }

  markRefreshing(): boolean {
    if (this.refreshing) return false;
    this.refreshing = true;
    return true;
  }

  clearRefreshing(): void {
    this.refreshing = false;
  }

  /** 本块是否到期需要刷新。 */
  isDue(intervalMinutes: number, now: number): boolean {
    if (this.refreshing) return false;
    if (this.lastRefreshedAt === 0) return true;
    return now - this.lastRefreshedAt >= intervalMinutes * 60_000;
  }

  async render(input: BlockContextInput, reason: RefreshReason): Promise<void> {
    if (this.disposed) return;
    if (!this.markRefreshing()) return;

    // 先记时间再 await：慢请求不该被下一个 tick 重复派发。
    this.lastRefreshedAt = Date.now();
    try {
      await renderBlock(input.block, {
        ...input,
        component: this.component,
        setStatus: (status) => this.setStatus(status),
      });
    } finally {
      this.clearRefreshing();
      void reason;
    }
  }

  /**
   * 积木配置变了：子 Component 必须重建，否则旧的 markdown 资源（事件监听、渲染器状态）
   * 会留在旧内容上。
   */
  resetComponent(): void {
    this.component.unload();
    this.component = new Component();
  }

  dispose(): void {
    this.disposed = true;
    this.component.unload();
    this.el.remove();
  }

  get currentStatus(): BlockStatus {
    return this.status;
  }
}

function statusMessage(status: BlockStatus): string {
  switch (status.kind) {
    case "ok":
      return "";
    case "empty":
    case "error":
      return status.message;
    case "stale":
      return tr(
        `Showing the last good value. ${status.message}`,
        `显示上一次成功取到的数据。${status.message}`,
      );
  }
}