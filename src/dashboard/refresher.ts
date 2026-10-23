/**
 * 可见性感知的刷新调度器。
 *
 * 用 window.setInterval + 显式 clearInterval，**不用 plugin.registerInterval**：
 * 后者把定时器绑在插件生命周期上，视图隐藏后仍会继续跑 —— 手机上开着一个不看的
 * 标签页就等于后台轮询，白耗电。
 */

import type { DashboardBlock, DashboardSettings } from "../types";
import type { BlockInstance } from "./BlockInstance";
import { intervalFor } from "./registry";

export class DashboardRefresher {
  private timer: number | null = null;
  private running = false;

  constructor(
    private readonly getBlocks: () => DashboardBlock[],
    private readonly getSettings: () => DashboardSettings,
    private readonly getInstances: () => BlockInstance[],
    private readonly refreshOne: (instance: BlockInstance, reason: "interval") => Promise<void>,
    private readonly tickMs: () => number,
  ) {}

  start(): void {
    if (this.timer !== null) return;
    this.timer = window.setInterval(() => void this.tick(), Math.max(1, this.tickMs()));
  }

  /** 视图隐藏：停表，已经在飞的那次请求让它跑完，不打断。 */
  suspend(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** 视图重新可见：重新起表，并立刻补一次到期的刷新。 */
  resume(): void {
    if (this.timer !== null) return;
    this.start();
    void this.tick();
  }

  stop(): void {
    this.suspend();
  }

  get isRunning(): boolean {
    return this.timer !== null;
  }

  /** 手动刷新全部（工具栏按钮）。 */
  async refreshAll(): Promise<void> {
    await this.pass("manual");
  }

  /** 库内容变化：只刷"库变更时自动刷新"的积木（目前是 Dataview 块）。 */
  async refreshOnVaultChange(): Promise<void> {
    const settings = this.getSettings();
    const now = Date.now();
    const instances = this.getInstances();
    const jobs: Promise<void>[] = [];

    for (const instance of instances) {
      const block = this.blockOf(instance);
      if (!block) continue;
      if (block.type === "dataview" && !block.refreshOnChange) continue;
      // 统计/属性类计算很便宜，但没必要每次改文件都重算全部；给个 30 秒下限。
      if (block.type !== "dataview" && now - instance.lastRefresh < 30_000) continue;
      jobs.push(this.refreshOne(instance, "interval"));
    }
    void settings;
    await Promise.all(jobs);
  }

  private async tick(): Promise<void> {
    await this.pass("interval");
  }

  private async pass(_reason: "interval" | "manual"): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const settings = this.getSettings();
      const now = Date.now();
      const jobs: Promise<void>[] = [];
      for (const instance of this.getInstances()) {
        const block = this.blockOf(instance);
        if (!block) continue;
        const interval = intervalFor(block, settings);
        if (!instance.isDue(interval, now)) continue;
        jobs.push(this.refreshOne(instance, "interval"));
      }
      await Promise.all(jobs);
    } finally {
      this.running = false;
    }
  }

  private blockOf(instance: BlockInstance): DashboardBlock | null {
    const id = instance.el.getAttribute("data-block-id");
    if (!id) return null;
    return this.getBlocks().find((b) => b.id === id) ?? null;
  }
}