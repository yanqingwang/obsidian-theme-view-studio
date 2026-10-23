import {
  App,
  Notice,
  PluginSettingTab,
  Setting,
  type SettingDefinition,
  type SettingDefinitionItem,
  type SettingGroupItem,
} from "obsidian";
import type ThemeStudioPlugin from "../main";
import type { ThemeProfile } from "../types";
import { normalizeFolder } from "../ScopeResolver";
import { resolveBlockKey } from "./dashboardGroups";
import type { DashboardSettings } from "../types";
import { PRESETS } from "../presets";
import { tr } from "../i18n";

type ColorField = "bgColor" | "textColor" | "mutedColor" | "accentColor";

function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export class ThemeStudioSettingTab extends PluginSettingTab {
  private editing: string;
  /** 新规则输入框的临时值，不是插件设置。 */
  private pendingRuleFolder = "";
  private pendingRuleProfileId: string;

  constructor(app: App, private readonly plugin: ThemeStudioPlugin) {
    super(app, plugin);
    this.editing = plugin.settings.defaultProfileId;
    this.pendingRuleProfileId = plugin.settings.defaultProfileId;
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    this.containerEl?.addClass("ts-settings");

    const settings = this.plugin.settings;
    if (!settings.profiles.some((p) => p.id === this.editing)) {
      this.editing = settings.defaultProfileId;
    }
    if (!settings.profiles.some((p) => p.id === this.pendingRuleProfileId)) {
      this.pendingRuleProfileId = settings.defaultProfileId;
    }

    const items: SettingDefinitionItem[] = [];
    items.push(this.generalGroup());
    items.push(this.themesGroup());
    const editing = this.current();
    if (editing) {
      items.push(...this.editorGroups(editing));
    }
    items.push(this.rulesList());
    items.push(this.addRuleGroup());
    items.push(...this.plugin.dashboardSettingItems);
    return items;
  }

  getControlValue(key: string): unknown {
    const settings = this.plugin.settings;
    if (key === "defaultProfileId") return settings.defaultProfileId;
    if (key === "showStatusBar") return settings.showStatusBar;
    if (key === "editingProfileId") return this.editing;
    if (key === "newRule.folder") return this.pendingRuleFolder;
    if (key === "newRule.profileId") return this.pendingRuleProfileId;

    if (key.startsWith("profile.")) {
      const field = key.slice("profile.".length) as keyof ThemeProfile;
      return this.current()?.[field];
    }

    if (key.startsWith("rule.")) {
      const [, rawIndex, field] = key.split(".");
      const rule = settings.scopeRules[Number(rawIndex)];
      return rule && field === "profileId" ? rule.profileId : undefined;
    }

    // 主页总开关那几项
    if (key.startsWith("dashboard.")) {
      const field = key.slice("dashboard.".length);
      const d = settings.dashboard as unknown as Record<string, unknown>;
      return field.startsWith("newBlock.")
        ? this.newBlockValue(field.slice("newBlock.".length))
        : d[field];
    }

    // 积木字段：key 用稳定 id 而不是下标 —— 列表可排序可删除，下标会绑错块。
    const resolved = resolveBlockKey(settings.dashboard.blocks, key);
    if (resolved) {
      return (resolved.block as unknown as Record<string, unknown>)[resolved.field];
    }

    return undefined;
  }

  setControlValue(key: string, value: unknown): void | Promise<void> {
    const settings = this.plugin.settings;

    if (key === "defaultProfileId") {
      settings.defaultProfileId = String(value);
      return this.plugin.persist();
    }
    if (key === "showStatusBar") {
      this.plugin.setStatusBarVisible(Boolean(value));
      return this.plugin.persist();
    }
    if (key === "editingProfileId") {
      this.editing = String(value);
      this.update();
      return;
    }
    if (key === "newRule.folder") {
      this.pendingRuleFolder = String(value ?? "");
      return;
    }
    if (key === "newRule.profileId") {
      this.pendingRuleProfileId = String(value);
      return;
    }

    if (key.startsWith("profile.")) {
      const profile = this.current();
      if (!profile) return;
      const field = key.slice("profile.".length) as keyof ThemeProfile;
      const record = profile as unknown as Record<string, unknown>;

      if (field === "name") {
        const name = String(value).trim();
        if (!name) return;
        record[field] = name;
      } else if (typeof value === "number") {
        if (!Number.isFinite(value)) return;
        record[field] = value;
      } else if (typeof value === "boolean") {
        record[field] = value;
      } else {
        record[field] = String(value).trim();
      }
      return this.plugin.persist();
    }

    if (key.startsWith("rule.")) {
      const [, rawIndex, field] = key.split(".");
      const rule = settings.scopeRules[Number(rawIndex)];
      if (rule && field === "profileId") {
        rule.profileId = String(value);
        return this.plugin.persist();
      }
    }

    if (key.startsWith("dashboard.")) {
      const field = key.slice("dashboard.".length);
      if (field.startsWith("newBlock.")) {
        this.setNewBlockValue(field.slice("newBlock.".length), value);
        return;
      }
      const d = this.plugin.settings.dashboard as unknown as Record<string, unknown>;
      const name = field as keyof DashboardSettings;
      if (name === "gap" || name === "intervalMin") {
        const n = typeof value === "number" ? value : Number(value);
        if (!Number.isFinite(n)) return;
        d[name] = n;
      } else if (name === "enabled" || name === "openOnStartup") {
        d[name] = Boolean(value);
      } else if (name === "githubToken" || name === "gridId") {
        d[name] = String(value).trim();
      } else {
        return;
      }
      // 网格变了，积木列表的"x/cap 格"和添加表单的滑块上限都要跟着变 —— 依赖这个值的
      // 渲染必须重跑一次；其余 dashboard 字段（gap/intervalMin/开关/token）没有这种联动。
      if (name === "gridId") this.update();
      return this.plugin.persist();
    }

    const resolved = resolveBlockKey(this.plugin.settings.dashboard.blocks, key);
    if (resolved) {
      const record = resolved.block as unknown as Record<string, unknown>;
      const v = typeof value === "string" ? value.trim() : value;
      record[resolved.field] = typeof v === "number" && !Number.isFinite(v) ? record[resolved.field] : v;
      return this.plugin.persist();
    }
  }

  // ── 主页：添加积木的临时表单值 ────────────────────────────────────────────

  private newBlockValue(field: string): unknown {
    const pending = this.plugin.dashboardEditor;
    if (field === "type") return pending.pendingType;
    if (field === "size") return pending.pendingSize;
    if (field === "title") return pending.pendingTitle;
    return undefined;
  }

  private setNewBlockValue(field: string, value: unknown): void {
    const pending = this.plugin.dashboardEditor;
    if (field === "type") {
      pending.pendingType = String(value) as typeof pending.pendingType;
    } else if (field === "size") {
      const n = typeof value === "number" ? value : Number(value);
      if (Number.isFinite(n)) pending.pendingSize = Math.trunc(n);
    } else if (field === "title") {
      pending.pendingTitle = String(value ?? "");
    }
    // 临时状态不落盘，也不触发重排。
  }

  // ── 分组 ────────────────────────────────────────────────────────────────────

  private generalGroup(): SettingDefinitionItem {
    const settings = this.plugin.settings;
    return {
      type: "group",
      heading: tr("General", "全局"),
      items: [
        {
          name: tr("Default theme", "默认主题"),
          desc: tr(
            "Used when no folder rule matches. Applies to the whole vault.",
            "没有命中任何文件夹规则时使用。整个库共用这一套外观。",
          ),
          control: {
            type: "dropdown",
            key: "defaultProfileId",
            options: this.profileOptions(),
            defaultValue: settings.defaultProfileId,
          },
        },
        {
          name: tr("Show current theme in status bar", "状态栏显示当前主题"),
          desc: tr(
            "Show the active theme name in the status bar; click it to return here.",
            "在右下角状态栏显示当前文件生效的主题名，点击可回到本设置页。",
          ),
          control: {
            type: "toggle",
            key: "showStatusBar",
            defaultValue: settings.showStatusBar,
          },
        },
      ],
    };
  }

  private themesGroup(): SettingDefinitionItem {
    const settings = this.plugin.settings;
    const items: SettingGroupItem[] = [
      {
        name: tr("Editing theme", "正在编辑的主题"),
        desc: tr(
          "Every setting below applies to this theme only.",
          "下面的所有参数只作用于这一套主题。",
        ),
        control: {
          type: "dropdown",
          key: "editingProfileId",
          options: this.profileOptions(),
          defaultValue: this.editing,
        },
      },
      {
        name: tr("New from preset", "从预设新建"),
        desc: tr(
          "Pick a starting point, then fine-tune it below.",
          "挑一个起点，之后可以继续微调。",
        ),
        render: (setting) => {
          let presetKey = PRESETS[0]?.key ?? "";
          setting.addDropdown((d) => {
            for (const preset of PRESETS) {
              d.addOption(preset.key, tr(preset.nameEn, preset.name));
            }
            d.setValue(presetKey).onChange((value) => {
              presetKey = value;
            });
          });
          setting.addButton((b) =>
            b
              .setButtonText(tr("Create", "新建"))
              .onClick(() => void this.createFromPreset(presetKey)),
          );
        },
      },
      {
        name: tr("Duplicate current theme", "复制当前主题"),
        desc: tr(
          "Clone the current settings as a starting point for a variant.",
          "以现有参数为基础再建一套，适合做小幅变体。",
        ),
        render: (setting) => {
          setting.addButton((b) =>
            b.setButtonText(tr("Duplicate", "复制")).onClick(() => void this.duplicateCurrent()),
          );
        },
      },
      {
        name: tr("Delete current theme", "删除当前主题"),
        desc: tr(
          "Folder rules that reference it are removed too. At least one theme is kept.",
          "引用它的文件夹规则会被一并移除；至少保留一套主题。",
        ),
        render: (setting) => {
          setting.addButton((b) =>
            b
              .setWarning()
              .setButtonText(tr("Delete", "删除"))
              .setDisabled(settings.profiles.length <= 1)
              .onClick(() => void this.deleteCurrent()),
          );
        },
      },
    ];

    return { type: "group", heading: tr("Themes", "主题"), items };
  }

  private editorGroups(profile: ThemeProfile): SettingDefinitionItem[] {
    return [
      {
        type: "group",
        heading: tr("Typography", "排版"),
        items: [
          {
            name: tr("Theme name", "主题名称"),
            control: {
              type: "text",
              key: "profile.name",
              defaultValue: profile.name,
            },
          },
          this.slider(
            tr("Reading width", "阅读视图宽度"),
            tr(
              "px; 0 = no limit (follow theme). 600-1400 works well.",
              "px，0 表示不限制（跟随主题）。建议 600–1400。",
            ),
            "profile.readingWidth",
            0,
            2000,
            20,
            (v) => (v > 0 ? `${v}px` : tr("follow theme", "跟随主题")),
          ),
          this.slider(
            tr("Editing width", "编辑视图宽度"),
            tr(
              "px; 0 = no limit. Use the same value as reading width to match.",
              "px，0 表示不限制。想和阅读视图一致就填相同值。",
            ),
            "profile.editingWidth",
            0,
            2000,
            20,
            (v) => (v > 0 ? `${v}px` : tr("follow theme", "跟随主题")),
          ),
          this.slider(
            tr("Font size", "字号"),
            tr("px; 0 = follow theme.", "px，0 表示跟随主题。"),
            "profile.fontSize",
            0,
            30,
            1,
            (v) => (v > 0 ? `${v}px` : tr("follow theme", "跟随主题")),
          ),
          this.slider(
            tr("Line height", "行高"),
            tr(
              "Multiplier; 0 = follow theme. 1.6-1.9 suits body text.",
              "倍数，0 表示跟随主题。正文建议 1.6–1.9。",
            ),
            "profile.lineHeight",
            0,
            2.6,
            0.05,
            (v) => (v > 0 ? v.toFixed(2) : tr("follow theme", "跟随主题")),
          ),
          this.slider(
            tr("Paragraph spacing", "段间距"),
            tr("em; 0 = follow theme.", "em，0 表示跟随主题。"),
            "profile.paragraphSpacing",
            0,
            3,
            0.1,
            (v) => (v > 0 ? v.toFixed(2) : tr("follow theme", "跟随主题")),
          ),
          {
            name: tr("Body font", "正文字体"),
            desc: tr(
              'e.g. "LXGW WenKai", serif. Empty = follow theme.',
              '例如 "LXGW WenKai", serif。留空跟随主题。',
            ),
            control: {
              type: "text",
              key: "profile.fontFamily",
              placeholder: tr("empty = follow theme", "留空 = 跟随主题"),
              defaultValue: profile.fontFamily,
            },
          },
        ],
      },
      {
        type: "group",
        heading: tr("Background and colors", "背景与颜色"),
        items: [
          this.colorDefinition(profile, "bgColor", tr("Background", "背景色"), "#1e1e1e"),
          this.colorDefinition(profile, "textColor", tr("Text", "正文颜色"), "#dcddde"),
          this.colorDefinition(profile, "mutedColor", tr("Muted text", "次要文字颜色"), "#999999"),
          this.colorDefinition(profile, "accentColor", tr("Accent", "强调色"), "#7c9cf5"),
          this.slider(
            tr("Background opacity", "背景不透明度"),
            tr(
              "1 = fully opaque. Pair with a wallpaper or blur; 0.6-0.85 works well.",
              "1 = 完全不透明。配合背景图或玻璃模糊使用，建议 0.6–0.85。",
            ),
            "profile.bgOpacity",
            0,
            1,
            0.05,
            (v) => v.toFixed(2),
          ),
          this.slider(
            tr("Sidebar opacity", "侧栏不透明度"),
            tr(
              "1 = opaque. Below 1 the wallpaper shows through.",
              "1 = 不透明。小于 1 时能看到背景图。",
            ),
            "profile.panelOpacity",
            0,
            1,
            0.05,
            (v) => v.toFixed(2),
          ),
          this.slider(
            tr("Background blur", "背景模糊"),
            tr(
              "px; 0 = off. 8-16 pairs best with translucent panels.",
              "px，0 = 关闭。半透明面板配合 8–16 效果最好。",
            ),
            "profile.blur",
            0,
            40,
            1,
            (v) => (v > 0 ? `${v}px` : tr("off", "关闭")),
          ),
          {
            name: tr("Wallpaper", "背景图"),
            desc: tr(
              "Vault-relative path (e.g. attachments/bg.jpg) or an http(s) image URL. Empty = none.",
              "vault 内相对路径（如 attachments/bg.jpg），或 http(s) 图片地址。留空不用图。",
            ),
            control: {
              type: "text",
              key: "profile.bgImage",
              placeholder: "attachments/bg.jpg",
              defaultValue: profile.bgImage,
            },
          },
        ],
      },
      {
        type: "group",
        heading: tr("E-ink", "墨水屏"),
        items: [
          {
            name: tr("Enable e-ink mode", "启用墨水屏模式"),
            desc: tr(
              "Grayscales the workspace and disables motion and shadows for an e-ink look.",
              "整个工作区灰度化、关闭动画与阴影，接近电子墨水屏观感。",
            ),
            control: {
              type: "toggle",
              key: "profile.eink",
              defaultValue: profile.eink,
            },
          },
          this.slider(
            tr("E-ink contrast", "墨水屏对比度"),
            tr(
              "1 = original contrast. Lower feels more like paper, higher is crisper.",
              "1 = 原始对比度。低一些更像纸，高一些更清晰。",
            ),
            "profile.einkContrast",
            0.8,
            1.6,
            0.05,
            (v) => v.toFixed(2),
          ),
        ],
      },
    ];
  }

  private rulesList(): SettingDefinitionItem {
    const rules: SettingGroupItem[] = this.plugin.settings.scopeRules.map((rule, index) => ({
      name: normalizeFolder(rule.folder) || tr("(entire vault)", "（整个库）"),
      desc: tr("Files in this folder use the selected theme.", "该文件夹内的文件使用所选主题。"),
      control: {
        type: "dropdown",
        key: `rule.${index}.profileId`,
        options: this.profileOptions(),
        defaultValue: rule.profileId,
      },
    }));

    return {
      type: "list",
      heading: tr("Folder rules", "文件夹规则"),
      emptyState: tr("No folder rules yet.", "还没有文件夹规则。"),
      items: rules,
      onDelete: (index) => {
        this.plugin.settings.scopeRules.splice(index, 1);
        void this.plugin.persist();
        this.update();
      },
    };
  }

  private addRuleGroup(): SettingDefinitionItem {
    return {
      type: "group",
      heading: tr("Add folder rule", "添加文件夹规则"),
      items: [
        {
          name: tr("Folder", "文件夹"),
          desc: tr(
            "The most specific folder wins when several rules match. To cover the whole vault, change the default theme instead.",
            "同一文件命中多条规则时，路径最长的文件夹优先。要覆盖整个库请直接修改默认主题。",
          ),
          control: {
            type: "folder",
            key: "newRule.folder",
            placeholder: tr("e.g. Daily/Output", "例如 Daily 思考/Output"),
            includeRoot: false,
          },
        },
        {
          name: tr("Theme", "主题"),
          desc: tr("Files in this folder use the selected theme.", "该文件夹内的文件使用所选主题。"),
          control: {
            type: "dropdown",
            key: "newRule.profileId",
            options: this.profileOptions(),
            defaultValue: this.pendingRuleProfileId,
          },
        },
        {
          name: tr("Add rule", "添加规则"),
          desc: tr(
            "Type or pick a folder, then choose the theme it should use.",
            "输入或从下拉里选一个文件夹，再选它要用的主题。",
          ),
          render: (setting) => {
            setting.addButton((b) =>
              b.setCta().setButtonText(tr("Add", "添加")).onClick(() => void this.addPendingRule()),
            );
          },
        },
      ],
    };
  }

  // ── 定义辅助 ────────────────────────────────────────────────────────────────

  private slider(
    name: string,
    desc: string,
    key: string,
    min: number,
    max: number,
    step: number,
    displayFormat: (value: number) => string,
  ): SettingDefinition {
    return {
      name,
      desc,
      control: {
        type: "slider",
        key,
        min,
        max,
        step,
        displayFormat,
      },
    };
  }

  private colorDefinition(
    profile: ThemeProfile,
    field: ColorField,
    name: string,
    fallback: string,
  ): SettingDefinition {
    return {
      name,
      desc: tr(
        "Pick a color on the left; empty = follow theme.",
        "点左侧色块选色；留空则跟随主题。",
      ),
      render: (setting) => this.renderColorRow(setting, profile, field, fallback),
    };
  }

  private renderColorRow(
    setting: Setting,
    profile: ThemeProfile,
    field: ColorField,
    fallback: string,
  ): void {
    const row = setting.controlEl.createDiv({ cls: "ts-color-row" });
    const picker = row.createEl("input", { cls: "ts-color-picker", attr: { type: "color" } });
    picker.value = profile[field] || fallback;
    const label = row.createSpan({
      cls: "ts-color-label",
      text: profile[field] || tr("Follow theme", "跟随主题"),
    });
    const reset = row.createEl("button", {
      cls: "ts-color-reset",
      text: tr("Follow theme", "跟随主题"),
      attr: { type: "button" },
    });

    picker.addEventListener("input", () => {
      label.setText(picker.value);
      profile[field] = picker.value;
      void this.plugin.persist();
    });
    reset.addEventListener("click", () => {
      picker.value = fallback;
      label.setText(tr("Follow theme", "跟随主题"));
      profile[field] = "";
      void this.plugin.persist();
    });
  }

  // ── 操作 ────────────────────────────────────────────────────────────────────

  private current(): ThemeProfile | undefined {
    return this.plugin.settings.profiles.find((p) => p.id === this.editing);
  }

  private profileOptions(): Record<string, string> {
    const options: Record<string, string> = {};
    for (const p of this.plugin.settings.profiles) options[p.id] = p.name;
    return options;
  }

  private async createFromPreset(presetKey: string): Promise<void> {
    const preset = PRESETS.find((p) => p.key === presetKey) ?? PRESETS[0];
    if (!preset) return;

    const taken = new Set(this.plugin.settings.profiles.map((p) => p.name));
    const base = tr(preset.nameEn, preset.name);
    let name = base;
    let n = 2;
    while (taken.has(name)) name = `${base} ${n++}`;

    const profile: ThemeProfile = { id: newId(), name, ...preset.values };
    this.plugin.settings.profiles.push(profile);
    this.editing = profile.id;
    await this.plugin.persist();
    this.update();
  }

  private async duplicateCurrent(): Promise<void> {
    const source = this.current();
    if (!source) return;

    const profile: ThemeProfile = {
      ...source,
      id: newId(),
      name: tr(`${source.name} copy`, `${source.name} 副本`),
    };
    this.plugin.settings.profiles.push(profile);
    this.editing = profile.id;
    await this.plugin.persist();
    this.update();
  }

  private async deleteCurrent(): Promise<void> {
    if (this.plugin.settings.profiles.length <= 1) {
      new Notice(tr("At least one theme must remain.", "至少要保留一套主题。"));
      return;
    }

    const target = this.current();
    if (!target) return;

    this.plugin.settings.profiles = this.plugin.settings.profiles.filter((p) => p.id !== target.id);
    this.plugin.settings.scopeRules = this.plugin.settings.scopeRules.filter(
      (r) => r.profileId !== target.id,
    );
    if (this.plugin.settings.defaultProfileId === target.id) {
      this.plugin.settings.defaultProfileId = this.plugin.settings.profiles[0].id;
    }
    this.editing = this.plugin.settings.defaultProfileId;
    await this.plugin.persist();
    this.update();
  }

  private async addPendingRule(): Promise<void> {
    const folder = normalizeFolder(this.pendingRuleFolder);
    if (!folder) {
      new Notice(
        tr(
          "Enter a folder path. To cover the whole vault, change the default theme instead.",
          "请填写文件夹路径；要覆盖整个库请直接修改默认主题。",
        ),
      );
      return;
    }

    const exists = this.plugin.settings.scopeRules.some(
      (r) => normalizeFolder(r.folder) === folder,
    );
    if (exists) {
      new Notice(tr("This folder already has a rule.", "该文件夹已有规则。"));
      return;
    }

    this.plugin.settings.scopeRules.push({
      folder,
      profileId: this.pendingRuleProfileId,
    });
    this.pendingRuleFolder = "";
    await this.plugin.persist();
    this.update();
  }
}
