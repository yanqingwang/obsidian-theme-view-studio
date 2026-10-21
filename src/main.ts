import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, ThemeProfile, ThemeStudioSettings } from "./types";
import { ThemeEngine } from "./ThemeEngine";
import { ThemeStudioSettingTab } from "./settings/SettingsTab";
import { PRESETS } from "./presets";
import { tr } from "./i18n";

export default class ThemeStudioPlugin extends Plugin {
  settings!: ThemeStudioSettings;
  engine!: ThemeEngine;
  private statusEl: HTMLElement | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.engine = new ThemeEngine(this.app, () => this.settings);
    this.engine.mount();

    this.addSettingTab(new ThemeStudioSettingTab(this.app, this));

    // 当前活动文件变化、标签切换、文件重命名都会改变命中的文件夹规则。
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.refreshTheme()));
    this.registerEvent(this.app.workspace.on("file-open", () => this.refreshTheme()));
    this.registerEvent(this.app.vault.on("rename", () => this.refreshTheme()));
    this.registerEvent(this.app.vault.on("create", () => this.refreshTheme()));
    this.registerEvent(this.app.vault.on("delete", () => this.refreshTheme()));

    this.addCommand({
      id: "open-settings",
      name: tr("Open Theme Studio settings", "打开 Theme Studio 设置"),
      callback: () => this.openSettings(),
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
