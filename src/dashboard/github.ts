/**
 * GitHub 文件抓取。
 *
 * 走 Contents API 而不是 raw.githubusercontent：前者支持 Authorization、能区分
 * "限流"和"没权限"、返回 sha 便于判断是否变化，错误也是结构化的。限流成本与 raw
 * 完全一样（匿名 60 次/小时每 IP，带 token 5000 次）。
 *
 * 传输必须用 Obsidian 的 requestUrl 而不是 fetch：它绕过 CORS，而且在手机上也可用
 * （移动端 webview 里裸 fetch 跨域不可靠）。
 */

import { requestUrl } from "obsidian";
import type { GithubFileBlock } from "../types";

export interface GitHubFile {
  /** 解码后的文本内容。 */
  text: string;
  /** Contents API 返回的内容 sha；内容未变时可用于跳过重绘。 */
  sha: string;
  /** 网页端可打开的链接，点击积木标题时用。 */
  htmlUrl: string;
  /** 是否是按 JSON 解析出来的。 */
  isJson: boolean;
  /** JSON 解析失败时的原始文本（isJson 为 false）。 */
  parseError?: string;
}

export type GitHubResult =
  | { ok: true; file: GitHubFile }
  | { ok: false; message: string; htmlUrl: string | null };

export function contentsUrl(owner: string, repo: string, path: string, branch: string): string {
  const p = path.replace(/^\/+/, "");
  const ref = branch.trim() || "main";
  return `https://api.github.com/repos/${owner}/${repo}/contents/${p}?ref=${encodeURIComponent(ref)}`;
}

export function htmlUrl(owner: string, repo: string, path: string, branch: string): string {
  const ref = branch.trim() || "main";
  return `https://github.com/${owner}/${repo}/blob/${ref}/${path.replace(/^\/+/, "")}`;
}

/** 没有 token 时的下限：60 次/小时的 20%。有 token 时 1 分钟。 */
export function minIntervalMinutes(hasToken: boolean): number {
  return hasToken ? 1 : 5;
}

export function clampInterval(minutes: number, hasToken: boolean): number {
  const floor = minIntervalMinutes(hasToken);
  const value = Number.isFinite(minutes) ? Math.trunc(minutes) : floor;
  if (value <= 0) return floor; // 0 = 只手动刷新，实际也至少等这么久
  return Math.max(floor, Math.min(1440, value));
}

/** Contents API 对 > 1MB 的文件直接报错，这是它的硬限制。 */
const MAX_API_FILE_BYTES = 1_000_000;

function base64ToText(b64: string): string {
  // Contents API 返回 base64；atob 在桌面和移动 webview 都有。
  const binary = atob(b64.replace(/\n/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder("utf-8").decode(bytes);
}

function looksLikeJson(text: string, path: string): boolean {
  if (/\.json$/i.test(path)) return true;
  const head = text.trim().slice(0, 2);
  return head === "{" || head === "[";
}

export async function fetchGitHubFile(
  block: GithubFileBlock,
  globalToken: string,
): Promise<GitHubResult> {
  const owner = block.owner.trim();
  const repo = block.repo.trim();
  const path = block.path.trim();
  if (!owner || !repo || !path) {
    return { ok: false, message: "Fill in owner, repo and path.", htmlUrl: null };
  }

  const token = (block.token.trim() || globalToken.trim()).trim();
  const url = contentsUrl(owner, repo, path, block.branch);
  const page = htmlUrl(owner, repo, path, block.branch);

  let res: { status: number; text: string; headers: Record<string, string> };
  try {
    const response = await requestUrl({
      url,
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      throw: false,
    });
    res = { status: response.status, text: response.text, headers: response.headers };
  } catch (err) {
    // requestUrl 在网络层失败时抛异常（throw:false 只覆盖 HTTP 状态码）。
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Network unavailable (${detail}).`, htmlUrl: page };
  }

  if (res.status === 0) {
    return { ok: false, message: "Network unavailable.", htmlUrl: page };
  }
  if (res.status === 401) {
    return { ok: false, message: "GitHub rejected the token.", htmlUrl: page };
  }
  if (res.status === 403) {
    const remaining = res.headers?.["x-ratelimit-remaining"];
    if (remaining === "0") {
      const reset = Number(res.headers?.["x-ratelimit-reset"] ?? 0);
      const when = reset ? new Date(reset * 1000).toLocaleTimeString() : "later";
      return { ok: false, message: `Rate limit reached; resets at ${when}.`, htmlUrl: page };
    }
    return { ok: false, message: "GitHub refused the request (403).", htmlUrl: page };
  }
  if (res.status === 404) {
    return { ok: false, message: `File not found on ${block.branch || "main"}.`, htmlUrl: page };
  }
  if (res.status === 422) {
    return { ok: false, message: "Repository or branch not found.", htmlUrl: page };
  }
  if (res.status !== 200) {
    return { ok: false, message: `GitHub returned HTTP ${res.status}.`, htmlUrl: page };
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(res.text) as Record<string, unknown>;
  } catch {
    return { ok: false, message: "Could not parse the GitHub response.", htmlUrl: page };
  }

  // 文件夹或超出体积限制时 API 会返回不含 content 的对象。
  const size = typeof payload.size === "number" ? payload.size : 0;
  if (size > MAX_API_FILE_BYTES) {
    return {
      ok: false,
      message: "File is too large for the GitHub API (over 1 MB).",
      htmlUrl: page,
    };
  }
  const content = typeof payload.content === "string" ? payload.content : "";
  if (!content) {
    return { ok: false, message: "No file content in the response.", htmlUrl: page };
  }

  let text: string;
  try {
    text = base64ToText(content);
  } catch {
    return { ok: false, message: "Could not decode the file content.", htmlUrl: page };
  }

  const sha = typeof payload.sha === "string" ? payload.sha : "";
  const isJson = looksLikeJson(text, path);
  if (isJson) {
    try {
      const pretty = JSON.stringify(JSON.parse(text), null, 2);
      return { ok: true, file: { text: pretty, sha, htmlUrl: page, isJson: true } };
    } catch (err) {
      // 内容不是合法 JSON：仍然显示原文，只是标注一下。
      return {
        ok: true,
        file: {
          text,
          sha,
          htmlUrl: page,
          isJson: false,
          parseError: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  return { ok: true, file: { text, sha, htmlUrl: page, isJson: false } };
}

export function truncate(text: string, maxChars: number): string {
  if (maxChars <= 0 || text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n… (${text.length - maxChars} more characters)`;
}