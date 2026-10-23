import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { repairDashboardSettings } from "../src/dashboard/repair.ts";
import { DEFAULT_DASHBOARD_SETTINGS } from "../src/types.ts";

describe("repairDashboardSettings — 老用户 data.json 不能把插件弄砖", () => {
  it("各种非对象输入都退回默认", () => {
    for (const bad of [null, undefined, 42, "x", [], true]) {
      const r = repairDashboardSettings(bad);
      assert.equal(r.gridId, DEFAULT_DASHBOARD_SETTINGS.gridId);
      assert.deepEqual(r.blocks, []);
    }
  });

  it("空对象 → 默认值", () => {
    assert.deepEqual(repairDashboardSettings({}), DEFAULT_DASHBOARD_SETTINGS);
  });

  it("blocks 不是数组时当作空数组", () => {
    assert.deepEqual(repairDashboardSettings({ blocks: "x" }).blocks, []);
    assert.deepEqual(repairDashboardSettings({ blocks: { a: 1 } }).blocks, []);
  });

  it("非法 gridId回落到默认网格", () => {
    assert.equal(repairDashboardSettings({ gridId: "bogus" }).gridId, "3x2");
    assert.equal(repairDashboardSettings({ gridId: 7 }).gridId, "3x2");
    assert.equal(repairDashboardSettings({ gridId: "4x4" }).gridId, "4x4");
  });

  it("数值字段被夹到合法范围", () => {
    const r = repairDashboardSettings({ gap: 999, intervalMin: 0 });
    assert.equal(r.gap, 24);
    assert.equal(r.intervalMin, 1);
    const r2 = repairDashboardSettings({ gap: -5, intervalMin: "abc" });
    assert.equal(r2.gap, 0);
    assert.equal(r2.intervalMin, DEFAULT_DASHBOARD_SETTINGS.intervalMin);
  });

  it("未知积木类型被丢掉，其余保留（宁可少一块也不要整页崩）", () => {
    const r = repairDashboardSettings({
      blocks: [
        { type: "from-the-future", size: 2 },
        { type: "stats", stat: "note-count", size: 2, id: "keep-me" },
      ],
    });
    assert.equal(r.blocks.length, 1);
    assert.equal(r.blocks[0].id, "keep-me");
  });

  it("size 被夹到 1..8", () => {
    const r = repairDashboardSettings({ blocks: [{ type: "stats", size: 99 }, { type: "stats", size: 0 }] });
    assert.equal(r.blocks[0].size, 8);
    assert.equal(r.blocks[1].size, 1);
  });

  it("重复 id 会重新生成，避免设置项串到别的块上", () => {
    const r = repairDashboardSettings({
      blocks: [
        { type: "stats", id: "same", stat: "note-count" },
        { type: "stats", id: "same", stat: "word-count" },
      ],
    });
    assert.equal(r.blocks.length, 2);
    assert.equal(r.blocks[0].id, "same");
    assert.notEqual(r.blocks[1].id, "same");
  });

  it("缺失 id 时自动补一个", () => {
    const r = repairDashboardSettings({ blocks: [{ type: "stats" }] });
    assert.ok(r.blocks[0].id.length > 0);
  });

  it("旧块缺少新增字段时用默认值补齐（无需写迁移）", () => {
    const r = repairDashboardSettings({ blocks: [{ type: "embed-note", size: 2 }] });
    const b = r.blocks[0];
    assert.equal(b.type, "embed-note");
    assert.equal(b.mode, "card"); //默认值
    assert.equal(b.summaryChars, 160);
    assert.equal(b.showTitle, true);
  });

  it("非法枚举值退回默认（renderMode / stat / dataview mode）", () => {
    const blocks = repairDashboardSettings({
      blocks: [
        { type: "github-file", renderMode: "evil" },
        { type: "stats", stat: "evil" },
        { type: "dataview", mode: "evil" },
      ],
    }).blocks;
    assert.equal(blocks[0].renderMode, "auto");
    assert.equal(blocks[1].stat, "note-count");
    assert.equal(blocks[2].mode, "query");
  });

  it("存盘值优先于默认值", () => {
    const r = repairDashboardSettings({
      enabled: true,
      gap: 4,
      githubToken: "t",
      blocks: [{ type: "stats", size: 3, stat: "word-count", folder: "AIReports", limit: 9 }],
    });
    assert.equal(r.enabled, true);
    assert.equal(r.gap, 4);
    assert.equal(r.githubToken, "t");
    assert.deepEqual(
      { ...r.blocks[0], id: undefined },
      {
        id: undefined,
        type: "stats",
        size: 3,
        title: "",
        showTitle: true,
        stat: "word-count",
        folder: "AIReports",
        limit: 9,
      },
    );
  });

  it("不修改传入对象", () => {
    const stored = { blocks: [{ type: "stats", size: 99 }], gap: 999 };
    const snapshot = JSON.stringify(stored);
    repairDashboardSettings(stored);
    assert.equal(JSON.stringify(stored), snapshot);
  });
});