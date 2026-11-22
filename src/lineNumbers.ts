import type { LineNumberMode } from "./types";

/**
 * Obsidian 编辑器行号是"每个 vault 一份"的编辑器配置（`vault.getConfig`），不是 CSS：
 * 关闭时编辑器根本不渲染行号 gutter，所以主题只能改写这个开关本身。
 * 键名与 Obsidian 内核 `editor:toggle-line-numbers` 命令用的是同一个。
 */
export const LINE_NUMBER_CONFIG_KEY = "showLineNumber";

/** 任何非法/缺失输入都当作 auto —— 老 data.json 里没有这个字段。 */
export function normalizeLineNumberMode(value: unknown): LineNumberMode {
  return value === "on" || value === "off" ? value : "auto";
}

export interface LineNumberPlan {
  /** 要写进 Obsidian 配置的值；null = 保持现有值不动。 */
  write: boolean | null;
  /**
   * 本轮之后应记住的"用户原值"。null 表示当前没有被主题接管；
   * 非 null 时，切回 auto（或插件卸载）要把它写回去。
   */
  restore: boolean | null;
}

/**
 * 决定一次主题应用对行号开关做什么。纯函数：不读配置、不写配置，只比较三个入参。
 *
 * - auto：没接管过就什么都不做；接管过就恢复用户原值。
 * - on / off：第一次接管时记下当前值，之后强制到目标值。
 */
export function planLineNumbers(
  mode: LineNumberMode,
  current: boolean,
  restore: boolean | null,
): LineNumberPlan {
  if (mode === "auto") {
    if (restore === null) return { write: null, restore: null };
    return { write: current === restore ? null : restore, restore: null };
  }
  const want = mode === "on";
  const saved = restore ?? current;
  return { write: current === want ? null : want, restore: saved };
}
