/**
 * 主页视图：一个全屏标签页，里面是网格化的积木。
 *
 * 布局的关键约定：**排版只在挂载/设置变更时算一次**，结果写进 CSS 变量，
 * 之后窗口怎么变都交给 CSS 断点（见 styles.css）。因此 onResize 故意是空的 ——
 * 没有 JS 重排，就没有移动端拖动窗口时的卡顿，也省电。
 */

import { ItemView, WorkspaceLeaf } from "obsidian";
import type { App } from "obsidian";
import type { DashboardBlock } from "../types";
import type ThemeStudioPlugin from "../main";
import { tr } from "../i18n";
import { BlockInstance } from "./BlockInstance";
import { DashboardRefresher } from "./refresher";
import { defaultTitleFor } from "./registry";
import { clampInt, getGrid, layoutBlocks, maxBlockSize, proportionSpan } from "./grid";

export const VIEW_TYPE_DASHBOARD = "theme-view-studio-dashboard-view";

/** 窄屏与手机上的有效列数。 */
const COLS_MD = 2;
const COLS_SM = 1;

export class DashboardView extends ItemView {
  private gridEl: HTMLElement | null = null;
  private overflowEl: HTMLElement | null = null;
  private instances: BlockInstance[] = [];
  private refresher: DashboardRefresher | null = null;
  /** 这个标签页当前是否可见 —— 隐藏时定时器停掉。 */
  private visible = true;
  private mounted = false;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: ThemeStudioPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_DASHBOARD;
  }

  getDisplayText(): string {
    return tr("Dashboard", "主页");
  }

  getIcon(): string {
    return "layout-dashboard";
  }

  /** 故意空实现：布局完全由 CSS 变量 + 媒体查询负责。 */
  onResize(): void {
    /* noop by design */
  }

  async onOpen(): Promise<void> {
    this.plugin.dashboardViews.add(this);
    this.build();
    this.visible = true;

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => this.syncVisibility()),
    );
    this.registerEvent(this.app.workspace.on("layout-change", () => this.syncVisibility()));
    this.registerEvent(
      this.app.vault.on("modify", () => {
        if (this.visible) void this.refresher?.refreshOnVaultChange();
      }),
    );
    this.registerEvent(
      this.app.metadataCache.on("changed", () => {
        if (this.visible) void this.refresher?.refreshOnVaultChange();
      }),
    );
  }

  async onClose(): Promise<void> {
    this.refresher?.stop();
    this.refresher = null;
    this.disposeInstances();
    this.plugin.dashboardViews.delete(this);
    this.contentEl.empty();
    this.mounted = false;
  }

  /** 设置改动后由插件调用：重建积木并按新网格重排。 */
  reconfigure(): void {
    if (!this.mounted) return;
    this.disposeInstances();
    this.buildToolbar();
    this.buildGrid();
    this.mountBlocks();
    this.refresher?.suspend();
    this.refresher?.start();
    void this.refreshAll();
    if (!this.visible) this.refresher?.suspend();
  }

  private build(): void {
    this.contentEl.empty();
    this.contentEl.addClass("ts-dash");

    this.buildToolbar();
    this.buildGrid();
    this.mountBlocks();

    this.refresher?.stop();
    this.refresher = new DashboardRefresher(
      () => this.plugin.settings.dashboard.blocks,
      () => this.plugin.settings.dashboard,
      () => this.instances,
      (instance, reason) => this.refreshInstance(instance, reason),
      () => this.plugin.settings.dashboard.intervalMin * 60_000,
    );
    this.refresher.start();
    void this.refreshAll();

    this.mounted = true;
  }

  private buildToolbar(): void {
    // reconfigure() 也会走到这里：先清掉上一轮的工具栏，避免越叠越多。
    this.contentEl.querySelectorAll(".ts-dash-toolbar").forEach((el) => el.remove());
    const toolbar = this.contentEl.createDiv({ cls: "ts-dash-toolbar" });
    toolbar.createDiv({ cls: "ts-dash-toolbar-title", text: tr("Dashboard", "主页") });

    const refreshBtn = toolbar.createEl("button", {
      cls: "ts-dash-toolbar-btn",
      text: tr("Refresh all", "全部刷新"),
      attr: { type: "button" },
    });
    refreshBtn.addEventListener("click", () => void this.refreshAll());

    const settingsBtn = toolbar.createEl("button", {
      cls: "ts-dash-toolbar-btn",
      text: tr("Settings", "设置"),
      attr: { type: "button" },
    });
    settingsBtn.addEventListener("click", () => this.plugin.openSettings());
  }

  private buildGrid(): void {
    const settings = this.plugin.settings.dashboard;
    const grid = getGrid(settings.gridId);

    // 只清上一轮的网格、溢出区和空态提示 —— 绝不能清 contentEl，否则会把刚建好的
    // 工具栏一起清掉（旧实现主页上永远看不到"全部刷新/设置"按钮）。
    this.gridEl?.remove();
    this.overflowEl?.remove();
    this.contentEl.querySelectorAll(".ts-dash-hint").forEach((el) => el.remove());

    this.gridEl = this.contentEl.createDiv({ cls: "ts-dash-grid" });
    this.gridEl.style.setProperty("--ts-dash-cols", String(grid.columns));
    this.gridEl.style.setProperty("--ts-dash-cols-md", String(COLS_MD));
    this.gridEl.style.setProperty("--ts-dash-cols-sm", String(COLS_SM));
    this.gridEl.style.setProperty("--ts-dash-gap", `${settings.gap}px`);

    this.overflowEl = this.contentEl.createDiv({ cls: "ts-dash-overflow" });
  }

  private get blocks(): DashboardBlock[] {
    return this.plugin.settings.dashboard.blocks;
  }

  private mountBlocks(): void {
    const settings = this.plugin.settings.dashboard;
    const grid = getGrid(settings.gridId);
    const cap = maxBlockSize(grid);
    const blocks = this.blocks;

    const gridEl = this.gridEl;
    const overflowEl = this.overflowEl;
    if (!gridEl || !overflowEl) return;

    gridEl.empty();
    overflowEl.empty();
    this.instances = [];

    if (blocks.length === 0) {
      const hint = this.contentEl.createDiv({ cls: "ts-dash-hint" });
      hint.createDiv({ text: tr("No blocks yet.", "还没有积木。") });
      const link = hint.createEl("a", { href: "#", text: tr("Add blocks in settings", "去设置里添加积木") });
      link.addEventListener("click", (ev) => {
        ev.preventDefault();
        this.plugin.openSettings();
      });
      return;
    }

    // 存盘里的 size 可能超过当前网格上限（比如换了更小的网格），渲染时夹一次，
    // 但不改用户数据 —— 设置里的滑块会照实显示夹后的值。
    const sizes = blocks.map((b) => clampInt(b.size, 1, Math.max(cap, 1), 1));
    const placements = layoutBlocks(sizes, grid.columns, grid.rows);

    placements.forEach((placement, i) => {
      const block = blocks[i];
      const instance = new BlockInstance(
        block,
        block.title.trim() || defaultTitleFor(block),
        block.showTitle,
        (b) => void this.refreshInstanceById(b.id, "manual"),
      );
      instance.el.setAttribute("data-block-id", block.id);

      const size = sizes[i];
      const md = proportionSpan(size, grid.columns, COLS_MD);
      const sm = proportionSpan(size, grid.columns, COLS_SM);
      instance.el.style.setProperty("--ts-dash-c", String(placement.spanCols));
      instance.el.style.setProperty("--ts-dash-r", String(placement.spanRows));
      instance.el.style.setProperty("--ts-dash-c-md", String(md.cols));
      instance.el.style.setProperty("--ts-dash-r-md", String(md.rows));
      instance.el.style.setProperty("--ts-dash-c-sm", String(sm.cols));
      instance.el.style.setProperty("--ts-dash-r-sm", String(sm.rows));
      instance.el.style.setProperty("--ts-dash-size", String(size));
      instance.el.style.setProperty("--ts-dash-cap", String(cap));

      if (placement.kind === "cell") {
        gridEl.appendChild(instance.el);
      } else {
        instance.el.addClass("ts-dash-block-overflow");
        overflowEl.appendChild(instance.el);
      }
      this.instances.push(instance);
    });
  }

  private disposeInstances(): void {
    for (const instance of this.instances) instance.dispose();
    this.instances = [];
  }

  private contextFor(block: DashboardBlock): {
    app: App;
    plugin: ThemeStudioPlugin;
    block: DashboardBlock;
    containerEl: HTMLElement;
    basePath: string;
    refresh: (reason: "manual" | "interval" | "vault-change" | "settings-change" | "initial") => Promise<void>;
  } {
    const instance = this.instances.find((x) => x.el.getAttribute("data-block-id") === block.id);
    return {
      app: this.app,
      plugin: this.plugin,
      block,
      containerEl: instance ? instance.bodyEl : this.contentEl,
      basePath: this.plugin.app.vault.getRoot().path,
      refresh: async (reason) => {
        void reason;
        await this.refreshInstanceById(block.id, "manual");
      },
    };
  }

  private async refreshInstance(
    instance: BlockInstance,
    reason: "interval" | "manual",
  ): Promise<void> {
    const id = instance.el.getAttribute("data-block-id");
    if (!id) return;
    const block = this.blocks.find((b) => b.id === id);
    if (!block) return;
    await instance.render(this.contextFor(block), reason);
  }

  private async refreshInstanceById(
    id: string,
    reason: "interval" | "manual",
  ): Promise<void> {
    const instance = this.instances.find((x) => x.el.getAttribute("data-block-id") === id);
    if (instance) await this.refreshInstance(instance, reason);
  }

  private async refreshAll(): Promise<void> {
    await this.refresher?.refreshAll();
  }

  private syncVisibility(): void {
    const active = this.app.workspace.getActiveViewOfType(DashboardView) === this;
    if (active === this.visible) return;
    this.visible = active;
    if (active) this.refresher?.resume();
    else this.refresher?.suspend();
  }
}