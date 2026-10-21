import {
  AbstractInputSuggest,
  App,
  Notice,
  PluginSettingTab,
  Setting,
  TextComponent,
  TFolder,
} from "obsidian";
import type ThemeStudioPlugin from "../main";
import type { ThemeProfile } from "../types";
import { normalizeFolder } from "../ScopeResolver";
import { PRESETS } from "../presets";
import { tr } from "../i18n";

/** 输入框的文件夹补全。 */
class FolderSuggest extends AbstractInputSuggest<string> {
  constructor(
    app: App,
    private readonly anchor: HTMLInputElement,
    private readonly folders: string[],
  ) {
    super(app, anchor);
  }

  getSuggestions(query: string): string[] {
    const q = query.trim().toLowerCase();
    return this.folders
      .filter((f) => f !== "")
      .filter((f) => (q ? f.toLowerCase().includes(q) : true))
      .slice(0, 30);
  }

  renderSuggestion(folder: string, el: HTMLElement): void {
    el.setText(folder);
  }

  selectSuggestion(folder: string): void {
    this.anchor.value = folder;
    this.anchor.dispatchEvent(new Event("input"));
    this.close();
  }
}

function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

interface SliderOptions {
  value: number;
  min: number;
  max: number;
  step: number;
  /** 点"跟随主题"时写回的值。 */
  reset: number;
  onChange: (v: number) => void;
}

export class ThemeStudioSettingTab extends PluginSettingTab {
  private editing: string;

  constructor(app: App, private readonly plugin: ThemeStudioPlugin) {
    super(app, plugin);
    this.editing = plugin.settings.defaultProfileId;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("ts-settings");

    this.renderGlobal(containerEl);
    this.renderProfiles(containerEl);
    this.renderEditor(containerEl);
    this.renderRules(containerEl);
  }

  // ── 全局 ────────────────────────────────────────────────────────────────────
  private renderGlobal(root: HTMLElement): void {
    new Setting(root).setName(tr("General", "全局")).setHeading();

    new Setting(root)
      .setName(tr("Default theme", "默认主题"))
      .setDesc(tr("Used when no folder rule matches. Applies to the whole vault.", "没有命中任何文件夹规则时使用。整个库共用这一套外观。"))
      .addDropdown((d) => {
        for (const p of this.plugin.settings.profiles) d.addOption(p.id, p.name);
        d.setValue(this.plugin.settings.defaultProfileId).onChange(async (id) => {
          this.plugin.settings.defaultProfileId = id;
          await this.plugin.persist();
        });
      });

    new Setting(root)
      .setName(tr("Show current theme in status bar", "状态栏显示当前主题"))
      .setDesc(tr("Show the active theme name in the status bar; click it to return here.", "在右下角状态栏显示当前文件生效的主题名，点击可回到本设置页。"))
      .addToggle((t) =>
        t.setValue(this.plugin.settings.showStatusBar).onChange(async (v) => {
          this.plugin.setStatusBarVisible(v);
          await this.plugin.persist();
        }),
      );
  }

  // ── 主题列表 ────────────────────────────────────────────────────────────────
  private renderProfiles(root: HTMLElement): void {
    new Setting(root).setName(tr("Themes", "主题")).setHeading();

    if (!this.plugin.settings.profiles.some((p) => p.id === this.editing)) {
      this.editing = this.plugin.settings.defaultProfileId;
    }

    new Setting(root)
      .setName(tr("Editing theme", "正在编辑的主题"))
      .setDesc(tr("Every setting below applies to this theme only.", "下面的所有参数只作用于这一套主题。"))
      .addDropdown((d) => {
        for (const p of this.plugin.settings.profiles) d.addOption(p.id, p.name);
        d.setValue(this.editing).onChange((id) => {
          this.editing = id;
          this.display();
        });
      });

    let presetKey = PRESETS[0].key;
    new Setting(root)
      .setName(tr("New from preset", "从预设新建"))
      .setDesc(tr("Pick a starting point, then fine-tune it below.", "挑一个起点，之后可以继续微调。"))
      .addDropdown((d) => {
        for (const preset of PRESETS) d.addOption(preset.key, tr(preset.nameEn, preset.name));
        d.setValue(presetKey).onChange((k) => {
          presetKey = k;
        });
      })
      .addButton((b) =>
        b.setButtonText(tr("Create", "新建")).onClick(async () => {
          const preset = PRESETS.find((p) => p.key === presetKey) ?? PRESETS[0];
          const taken = new Set(this.plugin.settings.profiles.map((p) => p.name));
          let name = tr(preset.nameEn, preset.name);
          let n = 2;
          while (taken.has(name)) name = `${tr(preset.nameEn, preset.name)} ${n++}`;
          const profile: ThemeProfile = { id: newId(), name, ...preset.values };
          this.plugin.settings.profiles.push(profile);
          this.editing = profile.id;
          await this.plugin.persist();
          this.display();
        }),
      );

    new Setting(root)
      .setName(tr("Duplicate current theme", "复制当前主题"))
      .setDesc(tr("Clone the current settings as a starting point for a variant.", "以现有参数为基础再建一套，适合做小幅变体。"))
      .addButton((b) =>
        b.setButtonText(tr("Duplicate", "复制")).onClick(async () => {
          const src = this.current();
          if (!src) return;
          const profile: ThemeProfile = { ...src, id: newId(), name: tr(`${src.name} copy`, `${src.name} 副本`) };
          this.plugin.settings.profiles.push(profile);
          this.editing = profile.id;
          await this.plugin.persist();
          this.display();
        }),
      );

    new Setting(root)
      .setName(tr("Delete current theme", "删除当前主题"))
      .setDesc(tr("Folder rules that reference it are removed too. At least one theme is kept.", "引用它的文件夹规则会被一并移除；至少保留一套主题。"))
      .addButton((b) =>
        b.setWarning().setButtonText(tr("Delete", "删除")).onClick(async () => {
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
          this.display();
        }),
      );
  }

  // ── 参数编辑 ────────────────────────────────────────────────────────────────
  private renderEditor(root: HTMLElement): void {
    const p = this.current();
    if (!p) return;

    new Setting(root).setName(tr("Typography", "排版")).setHeading();

    new Setting(root)
      .setName(tr("Theme name", "主题名称"))
      .addText((t) =>
        t.setValue(p.name).onChange(async (v) => {
          const trimmed = v.trim();
          if (trimmed) p.name = trimmed;
          await this.plugin.persist();
        }),
      );

    this.addNumberSlider(
      new Setting(root)
        .setName(tr("Reading width", "阅读视图宽度"))
        .setDesc(tr("px; 0 = no limit (follow theme). 600-1400 works well.", "px，0 表示不限制（跟随主题）。建议 600–1400。")),
      {
        value: p.readingWidth, min: 0, max: 2000, step: 20, reset: 0,
        onChange: async (v) => { p.readingWidth = v; await this.plugin.persist(); },
      },
    );

    this.addNumberSlider(
      new Setting(root)
        .setName(tr("Editing width", "编辑视图宽度"))
        .setDesc(tr("px; 0 = no limit. Use the same value as reading width to match.", "px，0 表示不限制。想和阅读视图一致就填相同值。")),
      {
        value: p.editingWidth, min: 0, max: 2000, step: 20, reset: 0,
        onChange: async (v) => { p.editingWidth = v; await this.plugin.persist(); },
      },
    );

    this.addNumberSlider(
      new Setting(root).setName(tr("Font size", "字号")).setDesc(tr("px; 0 = follow theme.", "px，0 表示跟随主题。")),
      {
        value: p.fontSize, min: 0, max: 30, step: 1, reset: 0,
        onChange: async (v) => { p.fontSize = v; await this.plugin.persist(); },
      },
    );

    this.addNumberSlider(
      new Setting(root).setName(tr("Line height", "行高")).setDesc(tr("Multiplier; 0 = follow theme. 1.6-1.9 suits body text.", "倍数，0 表示跟随主题。正文建议 1.6–1.9。")),
      {
        value: p.lineHeight, min: 0, max: 2.6, step: 0.05, reset: 0,
        onChange: async (v) => { p.lineHeight = v; await this.plugin.persist(); },
      },
    );

    this.addNumberSlider(
      new Setting(root).setName(tr("Paragraph spacing", "段间距")).setDesc(tr("em; 0 = follow theme.", "em，0 表示跟随主题。")),
      {
        value: p.paragraphSpacing, min: 0, max: 3, step: 0.1, reset: 0,
        onChange: async (v) => { p.paragraphSpacing = v; await this.plugin.persist(); },
      },
    );

    new Setting(root)
      .setName(tr("Body font", "正文字体"))
      .setDesc(tr('e.g. "LXGW WenKai", serif. Empty = follow theme.', '例如 "LXGW WenKai", serif。留空跟随主题。'))
      .addText((t) =>
        t.setPlaceholder(tr("empty = follow theme", "留空 = 跟随主题")).setValue(p.fontFamily).onChange(async (v) => {
          p.fontFamily = v.trim();
          await this.plugin.persist();
        }),
      );

    new Setting(root).setName(tr("Background and colors", "背景与颜色")).setHeading();

    this.colorRow(root, tr("Background", "背景色"), p.bgColor, "#1e1e1e", async (v) => {
      p.bgColor = v;
      await this.plugin.persist();
    });

    this.colorRow(root, tr("Text", "正文颜色"), p.textColor, "#dcddde", async (v) => {
      p.textColor = v;
      await this.plugin.persist();
    });

    this.colorRow(root, tr("Muted text", "次要文字颜色"), p.mutedColor, "#999999", async (v) => {
      p.mutedColor = v;
      await this.plugin.persist();
    });

    this.colorRow(root, tr("Accent", "强调色"), p.accentColor, "#7c9cf5", async (v) => {
      p.accentColor = v;
      await this.plugin.persist();
    });

    this.addNumberSlider(
      new Setting(root)
        .setName(tr("Background opacity", "背景不透明度"))
        .setDesc(tr("1 = fully opaque. Pair with a wallpaper or blur; 0.6-0.85 works well.", "1 = 完全不透明。配合背景图或玻璃模糊使用，建议 0.6–0.85。")),
      {
        value: p.bgOpacity, min: 0, max: 1, step: 0.05, reset: 1,
        onChange: async (v) => { p.bgOpacity = v; await this.plugin.persist(); },
      },
    );

    this.addNumberSlider(
      new Setting(root).setName(tr("Sidebar opacity", "侧栏不透明度")).setDesc(tr("1 = opaque. Below 1 the wallpaper shows through.", "1 = 不透明。小于 1 时能看到背景图。")),
      {
        value: p.panelOpacity, min: 0, max: 1, step: 0.05, reset: 1,
        onChange: async (v) => { p.panelOpacity = v; await this.plugin.persist(); },
      },
    );

    this.addNumberSlider(
      new Setting(root).setName(tr("Background blur", "背景模糊")).setDesc(tr("px; 0 = off. 8-16 pairs best with translucent panels.", "px，0 = 关闭。半透明面板配合 8–16 效果最好。")),
      {
        value: p.blur, min: 0, max: 40, step: 1, reset: 0,
        onChange: async (v) => { p.blur = v; await this.plugin.persist(); },
      },
    );

    new Setting(root)
      .setName(tr("Wallpaper", "背景图"))
      .setDesc(tr("Vault-relative path (e.g. attachments/bg.jpg) or an http(s) image URL. Empty = none.", "vault 内相对路径（如 attachments/bg.jpg），或 http(s) 图片地址。留空不用图。"))
      .addText((t) =>
        t.setPlaceholder("attachments/bg.jpg").setValue(p.bgImage).onChange(async (v) => {
          p.bgImage = v.trim();
          await this.plugin.persist();
        }),
      );

    new Setting(root).setName(tr("E-ink", "墨水屏")).setHeading();

    new Setting(root)
      .setName(tr("Enable e-ink mode", "启用墨水屏模式"))
      .setDesc(tr("Grayscales the workspace and disables motion and shadows for an e-ink look.", "整个工作区灰度化、关闭动画与阴影，接近电子墨水屏观感。"))
      .addToggle((t) =>
        t.setValue(p.eink).onChange(async (v) => {
          p.eink = v;
          await this.plugin.persist();
        }),
      );

    this.addNumberSlider(
      new Setting(root)
        .setName(tr("E-ink contrast", "墨水屏对比度"))
        .setDesc(tr("1 = original contrast. Lower feels more like paper, higher is crisper.", "1 = 原始对比度。低一些更像纸，高一些更清晰。")),
      {
        value: p.einkContrast, min: 0.8, max: 1.6, step: 0.05, reset: 1,
        onChange: async (v) => { p.einkContrast = v; await this.plugin.persist(); },
      },
    );
  }

  // ── 文件夹规则 ──────────────────────────────────────────────────────────────
  private renderRules(root: HTMLElement): void {
    new Setting(root)
      .setName(tr("Folder rules", "文件夹规则"))
      .setDesc(tr("The most specific folder wins: when several match, the longest path applies. Rules override the default theme.", "命中最具体的文件夹优先；同一文件命中多条时取路径最长的那条。规则的优先级高于默认主题。"))
      .setHeading();

    const profiles = this.plugin.settings.profiles;

    this.plugin.settings.scopeRules.forEach((rule, index) => {
      const label = normalizeFolder(rule.folder) || tr("(entire vault)", "（整个库）");
      new Setting(root)
        .setName(label)
        .setDesc(tr("Files in this folder use the selected theme.", "该文件夹内的文件使用所选主题。"))
        .addDropdown((d) => {
          for (const p of profiles) d.addOption(p.id, p.name);
          d.setValue(rule.profileId).onChange(async (id) => {
            rule.profileId = id;
            await this.plugin.persist();
          });
        })
        .addExtraButton((b) =>
          b.setIcon("trash").setTooltip(tr("Remove rule", "移除规则")).onClick(async () => {
            this.plugin.settings.scopeRules.splice(index, 1);
            await this.plugin.persist();
            this.display();
          }),
        );
    });

    let folder = "";
    let ruleProfile = this.plugin.settings.defaultProfileId;

    new Setting(root)
      .setName(tr("Add rule", "添加规则"))
      .setDesc(tr("Type or pick a folder, then choose the theme it should use.", "输入或从下拉里选一个文件夹，再选它要用的主题。"))
      .addText((t: TextComponent) => {
        t.setPlaceholder(tr("e.g. Daily/Output", "例如 Daily 思考/Output"));
        t.onChange((v) => {
          folder = v;
        });
        new FolderSuggest(this.app, t.inputEl, this.folderPaths());
      })
      .addDropdown((d) => {
        for (const p of profiles) d.addOption(p.id, p.name);
        d.setValue(ruleProfile).onChange((id) => {
          ruleProfile = id;
        });
      })
      .addButton((b) =>
        b.setCta().setButtonText(tr("Add", "添加")).onClick(async () => {
          const normalized = normalizeFolder(folder);
          if (!normalized) {
            new Notice(tr("Enter a folder path. To cover the whole vault, change the default theme instead.", "请填写文件夹路径；要覆盖整个库请直接修改默认主题。"));
            return;
          }
          const exists = this.plugin.settings.scopeRules.some(
            (r) => normalizeFolder(r.folder) === normalized,
          );
          if (exists) {
            new Notice(tr("This folder already has a rule.", "该文件夹已有规则。"));
            return;
          }
          this.plugin.settings.scopeRules.push({ folder: normalized, profileId: ruleProfile });
          await this.plugin.persist();
          this.display();
        }),
      );
  }

  // ── 小工具 ──────────────────────────────────────────────────────────────────
  private current(): ThemeProfile | undefined {
    return this.plugin.settings.profiles.find((p) => p.id === this.editing);
  }

  private folderPaths(): string[] {
    return this.app.vault
      .getAllLoadedFiles()
      .filter((f): f is TFolder => f instanceof TFolder)
      .map((f) => f.path)
      .filter((p) => p !== "/")
      .sort((a, b) => a.localeCompare(b));
  }

  private addNumberSlider(setting: Setting, opts: SliderOptions): void {
    let field: TextComponent | null = null;
    const decimals = opts.step < 1 ? 2 : 0;
    const shown = (v: number) => (decimals ? v.toFixed(decimals) : String(v));

    setting.addSlider((s) => {
      s.setLimits(opts.min, opts.max, opts.step)
        .setValue(Math.min(opts.max, Math.max(opts.min, opts.value)))
        .setDynamicTooltip()
        .onChange((v) => {
          field?.setValue(shown(v));
          opts.onChange(v);
        });
    });

    setting.addText((t) => {
      field = t;
      t.setValue(shown(opts.value));
      t.inputEl.addClass("ts-number-input");
      t.onChange((raw) => {
        const n = Number(raw);
        if (Number.isFinite(n)) opts.onChange(n);
      });
    });

    setting.addExtraButton((b) =>
      b.setIcon("rotate-ccw").setTooltip(tr("Reset to follow theme", "恢复为跟随主题")).onClick(() => {
        opts.onChange(opts.reset);
        this.display();
      }),
    );
  }

  private colorRow(
    root: HTMLElement,
    name: string,
    value: string,
    fallback: string,
    onChange: (v: string) => Promise<void> | void,
  ): void {
    const setting = new Setting(root).setName(name).setDesc(tr("Pick a color on the left; empty = follow theme.", "点左侧色块选色；留空则跟随主题。"));
    const row = setting.controlEl.createDiv({ cls: "ts-color-row" });
    const picker = row.createEl("input", { cls: "ts-color-picker", attr: { type: "color" } });
    picker.value = value || fallback;
    const label = row.createSpan({ cls: "ts-color-label", text: value || tr("Follow theme", "跟随主题") });
    const reset = row.createEl("button", { cls: "ts-color-reset", text: tr("Follow theme", "跟随主题") });

    picker.addEventListener("input", () => {
      label.setText(picker.value);
      void onChange(picker.value);
    });
    reset.addEventListener("click", () => {
      label.setText(tr("Follow theme", "跟随主题"));
      void onChange("");
    });
  }
}
