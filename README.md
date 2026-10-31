# Theme View Studio

[English](#english) | [中文](#中文)

---

## English

Folder-scoped appearance presets for Obsidian. Keep one default look for the
vault and give individual folders a different reading width, typography,
background, transparency, or e-ink treatment.

### Features

- **Vault-wide default theme** plus any number of additional named themes.
- **Folder rules** — the most specific matching folder wins, so
  `Projects/Reading` can override `Projects` without affecting the rest of the
  vault.
- **Per-theme controls** for reading and editing width, font size and family,
  line height, paragraph spacing, background color and opacity, wallpaper,
  sidebar opacity, blur, text/muted/accent colors, and e-ink mode.
- **E-ink mode** grayscales the workspace, removes motion and shadows, and
  lets you tune contrast.
- **Custom dashboard** — your own home tab, built from a grid of blocks: vault
  statistics, a field pulled out of any note's frontmatter, an embedded note, a
  file fetched from a GitHub repository, or a Dataview query. Blocks take 1 to 8
  cells of the grid and are filled in order.
- **Status bar indicator** showing the active theme name; click it to return to
  the settings tab.
- **Bilingual settings** that follow Obsidian's UI language (English/Chinese).
- **No generated stylesheets** — appearance changes are applied through CSS
  variables and the plugin's static `styles.css`.

### Requirements

- Obsidian **1.13.0** or later (desktop and mobile).

### Installation

#### From the community plugin directory

1. Open **Settings → Community plugins → Browse**.
2. Search for **Theme View Studio**.
3. Select **Install**, then **Enable**.

#### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the
   [latest release](https://github.com/yanqingwang/obsidian-theme-view-studio/releases/latest).
2. Create the folder `<vault>/.obsidian/plugins/theme-view-studio/`.
3. Put the three files in that folder.
4. Reload Obsidian, then enable **Theme View Studio** under
   **Settings → Community plugins**.

### Usage

1. Open **Settings → Theme View Studio**.
2. Pick a **Default theme**. It is used whenever no folder rule matches.
3. Use **New from preset** to add a theme, or **Duplicate current theme** to
   start from an existing one.
4. Adjust the selected theme under **Typography**, **Background and colors**,
   and **E-ink**. Values of `0` or an empty field mean "follow the current
   Obsidian theme".
5. Add a **Folder rule**: choose a folder, choose the theme it should use, and
   select **Add**.

Folder rules are resolved by longest path. If both `Projects` and
`Projects/Papers` match a file, the rule for `Projects/Papers` applies.

To build a dashboard:

1. Turn on **Enable the dashboard** in the **Dashboard** section.
2. Run **Open dashboard** from the command palette.
3. Under **Dashboard blocks**, use **Add block** to create one. Its type decides
   what it shows:
   - **Vault statistics** — note counts, notes changed today, word counts,
     recently modified notes. Pick a folder to narrow the scope.
   - **Note field** — any frontmatter key from any note, with a template such as
     `{{value}}` or `{{value}} · updated {{modified}}`.
   - **Embedded note** — the note as a card (title, summary, optional cover), or
     its content inline (needs a block of 2 cells or more).
   - **GitHub file** — a file from a repository, refreshed on a schedule. Without
     a token the minimum interval is 5 minutes, because the anonymous GitHub API
     allows 60 requests per hour per IP.
   - **Dataview** — a query, a DataviewJS script, or plain markdown. Requires the
     Dataview plugin; if it is missing the block says so instead of failing.
4. Set **Size in cells** for each block. A block can never take more than half of
   the grid: a 3 × 2 grid allows up to 3 cells, a 4 × 4 grid up to 8.
5. Drag blocks in the list to reorder them — the dashboard reflows immediately.

The dashboard uses the vault's **default theme**, because no note is open while it
is. A hidden dashboard tab does not refresh at all, which matters on mobile.

The plugin also adds three commands to the command palette:

- **Open Theme View Studio settings**
- **Open dashboard**
- **Toggle e-ink mode temporarily**

The plugin only changes appearance and reads your notes; it never moves,
renames, or edits them. The dashboard's GitHub token is stored in plaintext in
`data.json` — use a fine-grained read-only token, or leave it empty for public
repositories.

### Development

```bash
npm install
npm run dev    # watch and rebuild main.js
npm run build  # type-check and create the production bundle
npm test      # grid packing + settings repair (node:test, no extra deps)
```

Release assets are `main.js`, `manifest.json`, and `styles.css`. The release
workflow builds these files and publishes build provenance attestations.

### Issues & Feedback

- GitHub Issues: https://github.com/yanqingwang/obsidian-theme-view-studio/issues
- Email: wangyantsing@qq.com

When reporting a problem, please include your Obsidian version, plugin
version, and a screenshot or a short description of the expected result.

### License

[MIT](LICENSE)

---

## 中文

Obsidian 的文件夹级外观预设插件。整个库可以共用一套默认外观，同时让不同文件夹拥有各自的阅读宽度、排版、背景、透明度或墨水屏效果。

### 功能

- **全库默认主题**，并支持任意数量的命名主题。
- **文件夹规则**：命中多条规则时，路径最长的文件夹优先。例如
  `Projects/Reading` 可以覆盖 `Projects`，而不影响库里的其他文件。
- **每套主题独立配置**：阅读/编辑视图宽度、字号与字体、行高、段间距、
  背景色与不透明度、背景图、侧栏不透明度、模糊、正文/次要文字/强调色，
  以及墨水屏模式和对比度。
- **墨水屏模式**：工作区灰度化、关闭动画与阴影，并可调整对比度。
- **自定义主页**：你自己的首页标签页，由网格里的积木拼成 —— 库内统计、从任意笔记
  frontmatter 取字段、嵌入笔记、从 GitHub 仓库拉文件、Dataview 查询。单块可占 1 到 8
  格，按顺序自动填充。
- **状态栏提示**：显示当前文件生效的主题名，点击可回到插件设置页。
- **中英文设置界面**：跟随 Obsidian 的界面语言自动切换。
- **不动态生成样式表**：外观通过 CSS 变量和插件自带的静态
  `styles.css` 生效。

### 系统要求

- Obsidian **1.13.0** 或更高版本（桌面端和移动端）。

### 安装

#### 从第三方插件市场安装

1. 打开 **设置 → 第三方插件 → 浏览**。
2. 搜索 **Theme View Studio**。
3. 点击 **安装**，然后 **启用**。

#### 手动安装

1. 从 [最新 Release](https://github.com/yanqingwang/obsidian-theme-view-studio/releases/latest)
   下载 `main.js`、`manifest.json` 和 `styles.css`。
2. 创建文件夹 `<你的库>/.obsidian/plugins/theme-view-studio/`。
3. 把这三个文件放进该文件夹。
4. 重新加载 Obsidian，然后在 **设置 → 第三方插件** 中启用
   **Theme View Studio**。

### 使用

1. 打开 **设置 → Theme View Studio**。
2. 选择 **默认主题**。没有命中任何文件夹规则时使用这套外观。
3. 用 **从预设新建** 添加主题，或用 **复制当前主题** 基于现有主题创建变体。
4. 在 **排版**、**背景与颜色**、**墨水屏** 中调整当前主题。
   数值为 `0` 或留空表示"跟随当前 Obsidian 主题"。
5. 添加 **文件夹规则**：选择文件夹、选择要使用的主题，然后点击 **添加**。

文件夹规则按路径长度匹配。若 `Projects` 和 `Projects/Papers` 同时命中一个文件，
则使用 `Projects/Papers` 的规则。

插件还会在命令面板中提供三个命令：

- **打开 Theme View Studio 设置**
- **打开主页**
- **临时切换墨水屏模式**

搭主页的步骤：

1. 在 **Dashboard** 分组里打开 **启用主页**。
2. 用命令面板执行 **打开主页**。
3. 在 **主页积木** 下用 **添加积木** 新建一块，类型决定它显示什么：
   - **库内统计**：笔记总数、今天改过的篇数、字数、最近修改的笔记；可指定文件夹缩小范围。
   - **笔记属性**：任意笔记的任意 frontmatter 字段，支持 `{{value}}`、
     `{{value}} · 更新于 {{modified}}` 这类模板。
   - **嵌入笔记**：卡片模式（标题、摘要、可选封面）或内嵌正文（需要 2 格以上）。
   - **GitHub 文件**：定期拉取仓库里的一个文件。没有 Token 时刷新间隔下限 5 分钟 ——
     匿名 GitHub API 每IP 每小时只有 60 次。
   - **Dataview**：查询、DataviewJS 脚本或纯 Markdown。需要装 Dataview 插件；没装时积木会提示而不是报错。
4. 给每块设置 **占用格数**。单块不超过网格的一半：3 × 2 的网格最大 3 格，4 × 4 最大 8 格。
5. 在列表里拖动积木即可排序，主页会立刻重排。

主页用的是全库**默认主题** —— 主页激活时没有打开的笔记可依据。隐藏的标签页完全不刷新，
这一点在手机上尤其重要。

插件只改外观、只读你的笔记，不会移动、改名或编辑它们。主页的 GitHub Token 以明文存在
`data.json` 里，请使用细粒度只读 Token；公开库可以留空。

插件只改变外观，不会移动、重命名或修改笔记内容。

### 开发

```bash
npm install
npm run dev    # 监听并重新构建 main.js
npm run build  # 类型检查并生成生产构建
```

发布资源为 `main.js`、`manifest.json` 和 `styles.css`。发布流程会重新构建这些文件，并生成构建来源证明（artifact attestation）。

### 问题与反馈

- GitHub Issues: https://github.com/yanqingwang/obsidian-theme-view-studio/issues
- 邮箱：wangyantsing@qq.com

反馈问题时，请尽量附上 Obsidian 版本、插件版本，以及截图或预期结果说明。

### 许可证

[MIT](LICENSE)
