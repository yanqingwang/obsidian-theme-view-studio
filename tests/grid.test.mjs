import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DASHBOARD_GRIDS,
  layoutBlocks,
  maxBlockSize,
  proportionSpan,
} from "../src/dashboard/grid.ts";

/** 把排版结果还原成它占用的格子下标集合，用来检查有没有重叠。 */
function occupiedCells(placements, columns) {
  const cells = new Map();
  placements.forEach((p, i) => {
    if (p.kind !== "cell") return;
    const run = [];
    for (let r = 0; r < p.spanRows; r++) {
      for (let c = 0; c < p.spanCols; c++) {
        run.push((p.row + r) * columns + (p.col + c));
      }
    }
    cells.set(i, run);
  });
  return cells;
}

describe("maxBlockSize — 用户两条规则的交点", () => {
  it("= min(8, floor(n/2))：默认 3x2 是 3，4x4 才到 8", () => {
    const byId = Object.fromEntries(DASHBOARD_GRIDS.map((g) => [g.id, g]));
    assert.equal(maxBlockSize(byId["2x2"]), 2); // n=4  → 4/2 = 2
    assert.equal(maxBlockSize(byId["3x2"]), 3); // n=6  → 3
    assert.equal(maxBlockSize(byId["4x2"]), 4); // n=8  → 4
    assert.equal(maxBlockSize(byId["3x3"]), 4); // n=9  → 4（floor）
    assert.equal(maxBlockSize(byId["4x3"]), 6); // n=12 → 6
    assert.equal(maxBlockSize(byId["4x4"]), 8); // n=16 → 8（受 8 的上限约束）
  });

  it("任何预设下都落在 1..8", () => {
    for (const g of DASHBOARD_GRIDS) {
      const m = maxBlockSize(g);
      assert.ok(m >= 1 && m <= 8, `${g.id} -> ${m}`);
    }
  });
});

describe("layoutBlocks — 行对齐优先装箱", () => {
  it("放下的格子两两不相交，且总数与请求一致", () => {
    const sizes = [2, 1, 3, 1, 2, 1, 1];
    const grid = { columns: 4, rows: 3 };
    const placements = layoutBlocks(sizes, grid.columns, grid.rows);

    const all = [];
    for (const run of occupiedCells(placements, grid.columns).values()) all.push(...run);
    assert.equal(new Set(all).size, all.length, "格子不能重复占用");

    const placed = placements.filter((p) => p.kind === "cell");
    const overflow = placements.filter((p) => p.kind === "overflow");
    const accounted = [...placed, ...overflow].reduce((n, p) => n + p.size, 0);
    assert.equal(accounted, sizes.reduce((a, b) => a + b, 0), "不能丢块");
  });

  it("保持文档顺序：第 i 块不会排在第 i-1 块前面", () => {
    const sizes = [1, 3, 2, 1, 2];
    const placements = layoutBlocks(sizes, 4, 3);
    for (let i = 1; i < placements.length; i++) {
      const prev = placements[i - 1];
      const cur = placements[i];
      if (prev.kind !== "cell" || cur.kind !== "cell") continue;
      const prevStart = prev.row * 4 + prev.col;
      const curStart = cur.row * 4 + cur.col;
      assert.ok(curStart >= prevStart, `块 ${i} 排到了块 ${i - 1} 前面`);
    }
  });

  it("同一行内放得下时不会跨行", () => {
    const p = layoutBlocks([2], 4, 2)[0];
    assert.equal(p.kind, "cell");
    assert.equal(p.spanRows, 1);
    assert.equal(p.spanCols, 2);
  });

  it("剩下的格子不够时进overflow 栈，而不是被丢掉", () => {
    // 3x2 = 6 格，4+3 放不下 3。
    const placements = layoutBlocks([4, 3], 3, 2);
    assert.equal(placements.filter((p) => p.kind === "cell").length, 1);
    assert.equal(placements.filter((p) => p.kind === "overflow").length, 1);
    assert.equal(placements[1].index, 1, "overflow 块要保留自己的下标");
  });

  it("空网格上放最大块一定放得下", () => {
    for (const g of DASHBOARD_GRIDS) {
      const p = layoutBlocks([maxBlockSize(g)], g.columns, g.rows)[0];
      assert.equal(p.kind, "cell", `${g.id} 应放得下`);
      assert.ok(p.spanCols <= g.columns && p.spanRows <= g.rows);
    }
  });

  it("结果确定：同样输入两次调用深度相等（GitHub 块加载完重渲不能换位置）", () => {
    const sizes = [2, 3, 1, 1, 4];
    assert.deepEqual(layoutBlocks(sizes, 4, 3), layoutBlocks(sizes, 4, 3));
  });

  it("越界尺寸被夹住而不是崩掉", () => {
    const placements = layoutBlocks([0, 999, -3], 3, 2);
    assert.equal(placements.length, 3);
    assert.ok(placements.every((p) => p.size >= 1 && p.size <= 6));
  });
});

describe("proportionSpan — 窄屏等比换算", () => {
  it("4x3 网格里 size=6 的块，在 2 列下仍是满宽", () => {
    assert.deepEqual(proportionSpan(6, 4, 2), { cols: 2, rows: 3 });
  });

  it("单列时所有块都退化为 1 列", () => {
    assert.deepEqual(proportionSpan(6, 4, 1), { cols: 1, rows: 6 });
  });

  it("列数永远不超过目标列数", () => {
    for (let size = 1; size <= 8; size++) {
      for (const to of [1, 2, 3, 4, 6]) {
        const r = proportionSpan(size, 4, to);
        assert.ok(r.cols >= 1 && r.cols <= to, `size=${size} to=${to} -> ${r.cols}`);
        assert.ok(r.rows >= 1);
      }
    }
  });
});