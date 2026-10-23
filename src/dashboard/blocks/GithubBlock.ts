/**
 * GitHub 文件积木。
 *
 * 两个关键行为：
 * 1. 限流下限在渲染器里夹（不看设置里写了多少），手改 data.json 也绕不过。
 * 2. 刷新失败时**不清空**已有内容 —— 有旧值就继续显示旧值并标一个 stale 角标。
 *    一个临时网络抖动不该让主页空一块。
 */

import { MarkdownRenderer } from "obsidian";
import type { GithubFileBlock } from "../../types";
import type { BlockRenderer } from "../types";
import { clampInterval, fetchGitHubFile, truncate } from "../github";
import { tr } from "../../i18n";

/** 按 block.id 缓存上一次成功的结果，key 里带上配置指纹。 */
const cache = new Map<string, { fingerprint: string; text: string; sha: string; htmlUrl: string }>();

function fingerprint(block: GithubFileBlock, token: string): string {
  return [block.owner, block.repo, block.branch, block.path, block.renderMode, token].join("|");
}

export const githubFileRenderer: BlockRenderer<GithubFileBlock> = {
  type: "github-file",

  defaultTitle(block) {
    const path = block.path.trim();
    if (block.owner.trim() && block.repo.trim() && path) {
      return `${block.owner.trim()}/${block.repo.trim()}/${path}`;
    }
    return tr("GitHub file", "GitHub 文件");
  },

  intervalMinutes(block, settings) {
    const token = block.token.trim() || settings.githubToken.trim();
    return clampInterval(block.intervalMin, token.length > 0);
  },

  async render(ctx) {
    const { block, containerEl, plugin } = ctx;

    const result = await fetchGitHubFile(block, plugin.settings.dashboard.githubToken);

    if (!result.ok) {
      const key = block.id;
      const token = block.token.trim() || plugin.settings.dashboard.githubToken.trim();
      const fp = fingerprint(block, token);
      const prev = cache.get(key);
      if (prev && prev.fingerprint === fp) {
        // 有旧值：继续渲染旧内容 + stale 角标。
        await paint(ctx, prev.text, prev.htmlUrl, prev.sha);
        ctx.setStatus({ kind: "stale", message: result.message });
      } else {
        containerEl.empty();
        const errEl = containerEl.createDiv({ cls: "ts-dash-error", text: result.message });
        const link = errEl.createEl("a", {
          href: result.htmlUrl ?? "https://github.com",
          text: tr("Open on GitHub", "在 GitHub 打开"),
        });
        link.setAttribute("target", "_blank");
        link.setAttribute("rel", "noreferrer");
        ctx.setStatus({ kind: "error", message: result.message });
      }
      return;
    }

    const file = result.file;
    cache.set(block.id, {
      fingerprint: fingerprint(
        block,
        block.token.trim() || plugin.settings.dashboard.githubToken.trim(),
      ),
      text: file.text,
      sha: file.sha,
      htmlUrl: file.htmlUrl,
    });
    await paint(ctx, truncate(file.text, block.maxChars), file.htmlUrl, file.sha);
    ctx.setStatus(file.parseError ? { kind: "empty", message: tr("Not valid JSON — shown as text.", "不是合法 JSON，按纯文本显示。") } : { kind: "ok" });
  },
};

async function paint(
  ctx: Parameters<BlockRenderer<GithubFileBlock>["render"]>[0],
  text: string,
  url: string,
  sha: string,
): Promise<void> {
  const { containerEl, block, app, component } = ctx;
  containerEl.empty();

  const mode = block.renderMode;
  const asJson = mode === "auto" ? /\.(json)$/i.test(block.path.trim()) : mode === "text";
  if (asJson) {
    const pre = containerEl.createEl("pre", { cls: "ts-dash-block-code" });
    pre.textContent = text;
  } else {
    await MarkdownRenderer.render(app, text, containerEl, ctx.basePath, component);
  }

  const foot = containerEl.createDiv({ cls: "ts-dash-block-foot" });
  const link = foot.createEl("a", { href: url, text: tr("View on GitHub", "在 GitHub 查看") });
  link.setAttribute("target", "_blank");
  link.setAttribute("rel", "noreferrer");
  if (sha) foot.createSpan({ cls: "ts-dash-block-sha", text: sha.slice(0, 7) });
}