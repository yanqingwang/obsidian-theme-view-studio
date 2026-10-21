import type { ScopeRule, ThemeProfile, ThemeStudioSettings } from "./types";

/** 去掉首尾斜杠、折叠重复斜杠；空串表示库根。 */
export function normalizeFolder(path: string): string {
  return path
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

/**
 * 规则是否命中该文件：路径等于文件夹本身，或位于其子目录下。
 * 用 `/` 边界判断，避免 `Notes` 误匹配 `Notes-old/x.md`。
 */
export function ruleMatches(ruleFolder: string, filePath: string): boolean {
  const folder = normalizeFolder(ruleFolder);
  if (folder === "") return true;
  return filePath === folder || filePath.startsWith(folder + "/");
}

/**
 * 解析某个文件应使用的主题。
 * 命中多个规则时取"最具体"的那条（文件夹路径最长）；同长取最后一条，方便后加的规则覆盖前面的。
 */
export function resolveProfile(
  filePath: string | null,
  settings: ThemeStudioSettings,
): ThemeProfile {
  const byId = new Map(settings.profiles.map((p) => [p.id, p]));
  const fallback =
    byId.get(settings.defaultProfileId) ??
    settings.profiles[0] ??
    null;

  if (!filePath || settings.scopeRules.length === 0) {
    return fallback ?? emptyProfile();
  }

  let best: { rule: ScopeRule; folder: string } | null = null;
  for (const rule of settings.scopeRules) {
    if (!byId.has(rule.profileId)) continue;
    if (!ruleMatches(rule.folder, filePath)) continue;
    const folder = normalizeFolder(rule.folder);
    if (!best || folder.length >= best.folder.length) best = { rule, folder };
  }

  return (best && byId.get(best.rule.profileId)) ?? fallback ?? emptyProfile();
}

function emptyProfile(): ThemeProfile {
  return {
    id: "fallback",
    name: "跟随主题",
    readingWidth: 0,
    editingWidth: 0,
    fontSize: 0,
    lineHeight: 0,
    paragraphSpacing: 0,
    fontFamily: "",
    bgColor: "",
    bgImage: "",
    bgOpacity: 1,
    panelOpacity: 1,
    blur: 0,
    textColor: "",
    mutedColor: "",
    accentColor: "",
    eink: false,
    einkContrast: 1,
  };
}
