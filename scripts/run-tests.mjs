#!/usr/bin/env node
/**
 * 零依赖测试入口。
 *
 * 仓库原本没有任何测试基建，而这里有两个必须被测的纯函数：排版（错了整页错乱）
 * 和 data.json 修复（错了老用户升级即砖）。所以不引入任何新依赖——复用本仓库
 * 已经装着的 esbuild 把 .mjs 测试打成 node 能跑的产物，再用 Node 内置的
 * node:test 跑。
 *
 * 用法：npm test
 */
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const testDir = join(root, "tests");
const outDir = join(root, ".test-build");

const entryPoints = readdirSync(testDir)
  .filter((f) => f.endsWith(".test.mjs"))
  .map((f) => join(testDir, f));

if (entryPoints.length === 0) {
  console.error("no tests found in tests/*.test.mjs");
  process.exit(1);
}

rmSync(outDir, { recursive: true, force: true });

await build({
  entryPoints,
  outdir: outDir,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node18",
  // obsidian 只在类型层面出现，纯逻辑模块不 import 它；真出现了也不该在这里解析。
  external: ["obsidian", "electron", "node:*"],
  logLevel: "warning",
});

const result = spawnSync(process.execPath, ["--test", outDir], { stdio: "inherit" });
rmSync(outDir, { recursive: true, force: true });
process.exit(result.status ?? 1);