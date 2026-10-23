/**
 * 主页内部类型（不是用户设置的一部分）。
 *
 * 与 src/types.ts 的区别：那里描述"存盘的数据"，这里描述"渲染时需要的东西"。
 * 分开放是因为渲染上下文的生命周期跟设置无关 —— 它属于某个打开着的视图。
 */

import type { App, Component } from "obsidian";
import type { DashboardBlock, DashboardBlockType, DashboardSettings } from "../types";
import type ThemeStudioPlugin from "../main";

/** 积木在格子里的状态：正常 / 空/ 缺数据 / 出错 / 显示的是过期数据。 */
export type BlockStatus =
  | { kind: "ok" }
  | { kind: "empty"; message: string }
  | { kind: "error"; message: string }
  /** 刷新失败但上一次的数据还在用 —— 保留旧内容，只加个角标。 */
  | { kind: "stale"; message: string };

/** 为什么触发这次刷新（决定要不要发网络请求）。 */
export type RefreshReason = "initial" | "interval" | "manual" | "vault-change" | "settings-change";

/** 视图为每个积木准备好的输入（不含生命周期相关的部分）。 */
export interface BlockContextInput {
  app: App;
  plugin: ThemeStudioPlugin;
  block: DashboardBlock;
  /** 积木的内容容器（已清空）。渲染器只往这里写，绝不碰 innerHTML。 */
  containerEl: HTMLElement;
  /** 解析 wikilink / 相对路径的基准，一般是库根。 */
  basePath: string;
  refresh(reason: RefreshReason): Promise<void>;
}

/** 渲染一块积木所需的全部上下文。 */
export interface BlockRenderContext<T extends DashboardBlock = DashboardBlock>
  extends BlockContextInput {
  block: T;
  /** 这一块专属的子Component：MarkdownRenderer 等注册的东西挂在它上面，随它卸载。 */
  component: Component;
  setStatus(status: BlockStatus): void;
}

/** 一类积木的渲染器。五种类型是封闭集合，用户不能扩展，所以用固定表而非注册 API。 */
export interface BlockRenderer<T extends DashboardBlock = DashboardBlock> {
  readonly type: T["type"];
  /** 用户没起标题时显示什么。 */
  defaultTitle(block: T): string;
  /** 这个积木多久该刷新一次。渲染器在这里强制限流下限，手改 data.json 也绕不过。 */
  intervalMinutes(block: T, settings: DashboardSettings): number;
  render(ctx: BlockRenderContext<T>): Promise<void>;
}

/**
 * 放进同一张表看的渲染器类型。
 *
 * 成员全部用方法签名（不是 `render: (…) => …` 的属性签名）：TypeScript 对方法参数
 * 是双变的，所以 BlockRenderer<StatsBlock> 可以赋给这里 —— 属性签名的话严格函数类型
 * 会因为参数逆变而拒绝，而运行时我们本来就是按 block.type 对号入座的。
 */
export interface AnyBlockRenderer {
  readonly type: DashboardBlockType;
  defaultTitle(block: DashboardBlock): string;
  intervalMinutes(block: DashboardBlock, settings: DashboardSettings): number;
  render(ctx: BlockRenderContext): Promise<void>;
}

export interface BlockTypeInfo {
  type: DashboardBlockType;
  /** 设置页下拉里的双语名称。 */
  label: { en: string; zh: string };
}