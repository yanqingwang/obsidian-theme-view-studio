import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, ThemeProfile, ThemeStudioSettings } from "./types";
import { ThemeEngine } from "./ThemeEngine";
import { repairDashboardSettings } from "./dashboard/repair";
import { DashboardView, VIEW_TYPE_DASHBOARD } from "./dashboard/DashboardView";
import { dashboardGroups, type DashboardEditorState } from "./settings/dashboardGroups";
import { ThemeStudioSettingTab } from "./settings/SettingsTab";
import { PRESETS } from "./presets";
import { tr } from "./i18n";

export default class ThemeStudioPlugin extends Plugin {
  settings!: ThemeStudioSettings;
  engine!: ThemeEngine;
  private statusEl: HTMLElement | null = null;
  /**
   * 当前打开的主页视图。设置改动后要通知它们重排 —— 这些视图自己会在onClose 时
   * 把自己摘掉，所以这里不需要额外清理。
   */
  readonly dashboardViews = new Set<DashboardView>();
  /** 设置页与设置页之间共享的临时状态（不是插件设置）。 */
  readonly dashboardEditor: DashboardEditorState = {
    editingBlockId: "",
    pendingType: "stats",
    pendingSize: 1,
    pendingTitle: "",
  };

  async onload(): Promise<void> {
    await this.loadSettings();

    this.engine = new ThemeEngine(this.app, () => this.settings);
    this.engine.mount();

    this.registerView(VIEW_TYPE_DASHBOARD, (leaf) => new DashboardView(leaf, this));
    this.addSettingTab(new ThemeStudioSettingTab(this.app, this));

    // 启动时自动打开主页：等布局就绪再开，否则第一次启动工作区还没建好。
    this.app.workspace.onLayoutReady(() => {
      const d = this.settings.dashboard;
      if (!d.enabled || !d.openOnStartup) return;
      if (this.app.workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD).length > 0) return;
      void this.openDashboard();
    });

    // 当前活动文件变化、标签切换、文件重命名都会改变命中的文件夹规则。
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.refreshTheme()));
    this.registerEvent(this.app.workspace.on("file-open", () => this.refreshTheme()));
    this.registerEvent(this.app.vault.on("rename", () => this.refreshTheme()));
    this.registerEvent(this.app.vault.on("create", () => this.refreshTheme()));
    this.registerEvent(this.app.vault.on("delete", () => this.refreshTheme()));

    this.addCommand({
      id: "open-settings",
      name: tr("Open Theme View Studio settings", "打开 Theme View Studio 设置"),
      callback: () => this.openSettings(),
    });

    this.addCommand({
      id: "open-dashboard",
      name: tr("Open dashboard", "打开主页"),
      callback: () => void this.openDashboard(),
    });

    this.addCommand({
      id: "toggle-eink",
      name: tr("Toggle e-ink mode temporarily", "临时切换墨水屏模式"),
      callback: () => {
        if (document.body.hasAttribute("data-ts-eink")) document.body.removeAttribute("data-ts-eink");
        else document.body.setAttribute("data-ts-eink", "1");
      },
    });

    if (this.settings.showStatusBar) this.ensureStatusBar();
    this.refreshTheme();
  }

  onunload(): void {
    this.engine?.unmount();
    this.statusEl?.remove();
    this.statusEl = null;
  }

  refreshTheme(): void {
    const profile = this.engine.apply();
    this.statusEl?.setText(tr("Theme", "主题") + ` · ${profile.name}`);
  }

  /** 设置页改动后调用：保存 + 重新生成样式表 + 立即应用。 */
  async persist(): Promise<void> {
    await this.saveData(this.settings);
    this.engine.render();
    this.updateStatusBarVisibility();
    // 主页开着就重排一次，用户在设置里改完能立刻看到效果，不用手动刷新页面。
    for (const view of this.dashboardViews) view.reconfigure();
  }

  /** 打开（若已打开则聚焦）主页标签页。 */
  async openDashboard(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD);
    const leaf = existing[0] ?? workspace.getLeaf("tab");
    await leaf.setViewState({ type: VIEW_TYPE_DASHBOARD, active: true });
    workspace.revealLeaf(leaf);
  }

  /** 供设置页构造主页分组。 */
  get dashboardSettingItems() {
    return dashboardGroups({
      plugin: this,
      editor: this.dashboardEditor,
      openDashboard: () => void this.openDashboard(),
    });
  }

  setStatusBarVisible(visible: boolean): void {
    this.settings.showStatusBar = visible;
    this.updateStatusBarVisibility();
  }

  private updateStatusBarVisibility(): void {
    if (this.settings.showStatusBar) this.ensureStatusBar();
    else {
      this.statusEl?.remove();
      this.statusEl = null;
    }
  }

  private ensureStatusBar(): void {
    if (this.statusEl) return;
    const el = this.addStatusBarItem();
    el.addClass("ts-status");
    el.onClickEvent(() => this.openSettings());
    this.statusEl = el;
    const profile = this.engine.apply();
    el.setText(tr("Theme", "主题") + ` · ${profile.name}`);
  }

  openSettings(): void {
    const setting = (this.app as unknown as { setting?: { open(): void; openTabById(id: string): void } }).setting;
    if (!setting) return;
    setting.open();
    setting.openTabById(this.manifest.id);
  }

  private async loadSettings(): Promise<void> {
    const stored = (await this.loadData()) as Partial<ThemeStudioSettings> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, stored ?? {});
    if (!Array.isArray(this.settings.profiles) || this.settings.profiles.length === 0) {
      this.settings.profiles = this.seedProfiles();
    }
    if (!Array.isArray(this.settings.scopeRules)) this.settings.scopeRules = [];
    if (!this.settings.profiles.some((p) => p.id === this.settings.defaultProfileId)) {
      this.settings.defaultProfileId = this.settings.profiles[0].id;
    }
    // 主页是 v1.3.0 才有的字段，老用户的 data.json 里根本没有它；而 Object.assign 是浅合并，
    // 所以必须显式修一次，不能指望默认值兜住（repair 对任何奇怪输入都不抛异常）。
    this.settings.dashboard = repairDashboardSettings(stored?.dashboard);
    this.settings.schemaVersion = DEFAULT_SETTINGS.schemaVersion;
  }

  /** 首次安装时把内置预设全部装进主题列表，用户直接就能选。 */
  private seedProfiles(): ThemeProfile[] {
    return PRESETS.map((preset) => ({
      id: preset.key,
      name: tr(preset.nameEn, preset.name),
      ...preset.values,
    }));
  }
}
