import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeLineNumberMode, planLineNumbers } from "../src/lineNumbers.ts";

describe("normalizeLineNumberMode — 老 data.json 不能因为缺字段而接管行号", () => {
  it("缺失/非法值一律 auto", () => {
    for (const bad of [undefined, null, "", "ON", "x", 1, true, {}]) {
      assert.equal(normalizeLineNumberMode(bad), "auto");
    }
  });

  it("合法值原样保留", () => {
    assert.equal(normalizeLineNumberMode("auto"), "auto");
    assert.equal(normalizeLineNumberMode("on"), "on");
    assert.equal(normalizeLineNumberMode("off"), "off");
  });
});

describe("planLineNumbers — 只在需要时写配置", () => {
  it("auto 且从未接管：什么都不做", () => {
    assert.deepEqual(planLineNumbers("auto", true, null), { write: null, restore: null });
    assert.deepEqual(planLineNumbers("auto", false, null), { write: null, restore: null });
  });

  it("第一次强制显示：记下用户原值并写入 true", () => {
    assert.deepEqual(planLineNumbers("on", false, null), { write: true, restore: false });
    assert.deepEqual(planLineNumbers("off", true, null), { write: false, restore: true });
  });

  it("目标值已经生效：不重复写配置", () => {
    assert.deepEqual(planLineNumbers("on", true, null), { write: null, restore: true });
    assert.deepEqual(planLineNumbers("off", false, null), { write: null, restore: false });
  });

  it("已在接管中切换 on/off：更新配置，原值保持不变", () => {
    assert.deepEqual(planLineNumbers("off", true, false), { write: false, restore: false });
    assert.deepEqual(planLineNumbers("on", false, true), { write: true, restore: true });
  });

  it("切回 auto：恢复用户原值并结束接管", () => {
    assert.deepEqual(planLineNumbers("auto", false, true), { write: true, restore: null });
    assert.deepEqual(planLineNumbers("auto", true, false), { write: false, restore: null });
  });

  it("切回 auto 且当前值已经等于原值：不写配置", () => {
    assert.deepEqual(planLineNumbers("auto", true, true), { write: null, restore: null });
  });
});
