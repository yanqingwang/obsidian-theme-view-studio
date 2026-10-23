/**
 * 主页网格：预设、块大小上限、以及"行对齐优先装箱"排版算法。
 *
 * 这个文件刻意不 import `obsidian` —— 它是纯计算，因此可以在 node 里直接跑测试
 * （见 tests/grid.test.mjs）。排版一旦出错整页就会错乱，而这种错肉眼很难看出。
 */

/** 一个网格预设：columns × rows = n 个格子。 */
export interface GridPreset {
  id: string;
  columns: number;
  rows: number;
  /** 格子总数 n。 */
  n: number;
}

export const DASHBOARD_GRIDS: readonly GridPreset[] = [
  { id: "2x2", columns: 2, rows: 2, n: 4 },
  { id: "3x2", columns: 3, rows: 2, n: 6 },
  { id: "4x2", columns: 4, rows: 2, n: 8 },
  { id: "3x3", columns: 3, rows: 3, n: 9 },
  { id: "4x3", columns: 4, rows: 3, n: 12 },
  { id: "4x4", columns: 4, rows: 4, n: 16 },
];

export const DEFAULT_GRID_ID = "3x2";

export function getGrid(gridId: string): GridPreset {
  return DASHBOARD_GRIDS.find((g) => g.id === gridId) ?? gridById(DEFAULT_GRID_ID);
}

function gridById(id: string): GridPreset {
  const found = DASHBOARD_GRIDS.find((g) => g.id === id);
  // DEFAULT_GRID_ID 一定在表里，所以这里不会真的走到 fallback。
  return found ?? { id: "2x2", columns: 2, rows: 2, n: 4 };
}

/**
 * 单个积木允许占的最大格子数 = min(8, floor(n / 2))。
 *
 * 两条用户规则合起来就是这个式子：块大小 1..8，且不超过总格子数的一半。
 * 4x4（n=16）时上限正好是 8；默认的 3x2（n=6）时是 3。
 */
export function maxBlockSize(grid: GridPreset): number {
  return Math.max(1, Math.min(8, Math.floor(grid.n / 2)));
}

/** 把任意输入夹到 [min, max] 的整数；非数字回落到fallback。 */
export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** 排版结果：要么是一个干净的矩形（可放进 CSS grid），要么进溢出栈。 */
export interface GridPlacement {
  kind: "cell" | "overflow";
  /** 块在用户配置数组里的下标，保持文档顺序。 */
  index: number;
  /** kind === "cell" 时有效：起始行（0 基）。 */
  row: number;
  /** kind === "cell" 时有效：起始列（0 基）。 */
  col: number;
  /** kind === "cell" 时有效：跨列数。 */
  spanCols: number;
  /** kind === "cell" 时有效：跨行数。 */
  spanRows: number;
  /** 原始请求的格子数，供 UI 显示"3/6 格"。 */
  size: number;
}

/**
 * 行对齐优先装箱（row-aligned first fit）。
 *
 * 格子按行优先线性化：下标 i → (row = floor(i / columns), col = i % columns)。
 * 依次给每个块找起点，允许两种摆法：
 *   A. 同一行内放得下（col + size <= columns）
 *   B. 从行首开始，向下跨行（col === 0）
 * 两种都不成立就说明会留下 CSS grid 表达不出来的 L 形空洞，跳过继续找。
 * 都放不下的块进overflow 栈（不静默丢弃，否则看起来像数据丢了）。
 *
 * 纯函数：同样的输入永远得到同样的输出，没有任何随机、时间或Map 遍历。
 */
export function layoutBlocks(sizes: number[], columns: number, rows: number): GridPlacement[] {
  const cols = Math.max(1, Math.floor(columns));
  const total = Math.max(1, Math.floor(cols * Math.max(1, Math.floor(rows))));
  const occupied = new Array<boolean>(total).fill(false);
  const placements: GridPlacement[] = [];

  sizes.forEach((rawSize, index) => {
    const size = Math.max(1, Math.min(total, Math.floor(rawSize) || 1));
    let placedAt = -1;

    for (let start = 0; start + size <= total; start++) {
      const col = start % cols;
      const fitsInRow = col + size <= cols;
      const startsRow = col === 0;
      if (!fitsInRow && !startsRow) continue;

      let free = true;
      for (let i = start; i < start + size; i++) {
        if (occupied[i]) {
          free = false;
          break;
        }
      }
      if (!free) continue;

      for (let i = start; i < start + size; i++) occupied[i] = true;
      placedAt = start;
      break;
    }

    if (placedAt < 0) {
      placements.push({ kind: "overflow", index, row: 0, col: 0, spanCols: cols, spanRows: 1, size });
      return;
    }

    const row = Math.floor(placedAt / cols);
    const col = placedAt % cols;
    const spanCols = Math.min(size, cols - col);
    const spanRows = Math.max(1, Math.ceil((size - spanCols) / cols) + 1);
    placements.push({ kind: "cell", index, row, col, spanCols, spanRows, size });
  });

  return placements;
}

/**
 * 移动端/窄屏下的等比换算：块在"有效列数"下应该跨几列。
 *
 * 换算而不是简单砍到 1，是为了让大块在窄屏上仍然是最大的那个元素
 * （4x3 网格里 size=6 的块，在 2 列下仍是 2 列满宽）。
 */
export function proportionSpan(
  size: number,
  fromCols: number,
  toCols: number,
): { cols: number; rows: number } {
  const from = Math.max(1, Math.floor(fromCols));
  const to = Math.max(1, Math.floor(toCols));
  const want = Math.ceil((Math.max(1, size) * to) / from);
  const cols = Math.min(to, Math.max(1, want));
  const rows = Math.max(1, Math.ceil(Math.max(1, size) / cols));
  return { cols, rows };
}