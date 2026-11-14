# 健康扫描扩展：接覆盖率与目标仓库的架构检查

> **Status**: Accepted（用户 2026-11-14 授权继续）
> **起始日期**：2026-11-14
> **预估工时**：45–75 分钟
> **对应提交**：待回填
> **被取代**：—

## 背景

健康扫描目前只有「行数 + SwiftLint」。两个明显缺口：
覆盖率看不到、目标仓库已有的架构检查结论没并进来，导致同一件事有两套说法。

## 目标与非目标

**目标**

- `--coverage-json <path>`：解析 `xcrun xccov view --report --json` 的输出（target 级覆盖率），
  报告里给出每个 target 的百分比与平均值；`--min-coverage`（默认 85）参与 `--gate`。
- `--arch`：目标仓库有 `scripts/check-architecture.sh` 时，用 `--facts` 跑一次（只读），
  把退出码与最后两行结论并进报告；失败也参与 `--gate`。
- 两个新解析器都是纯函数、可单测；坏输入跳过而不是中断整份报告。

**非目标**

- 不自己跑 xcodebuild test（覆盖率高成本，属于目标仓库 CI）。
- 不重复实现架构规则（用目标仓库的脚本）。

## 方案

- `parseXccovCoverage(json)`：`targets[].lineCoverage`（0–1）→ `{targets, overall}`。
- `summarizeArchitecture(exitCode, output)`：取退出码 + 最后两行。
- CLI 两个开关；gate 条件扩展为「超限 或 Error 或 覆盖率不足 或 架构违规」。

## 被否决的方案

| 方案 | 否决理由 |
| --- | --- |
| 自己解析 .xcresult | xccov 已经给了 JSON，解析 bundle 是重复劳动 |
| 自己重写架构规则 | 目标仓库的 fact.json 是它的真相源，外部重写会打架 |

## 测试计划

| 用例 | target | 断言 |
| --- | --- | --- |
| 覆盖率解析 | `test/health.test.mjs` | 两个 target、百分比、平均 80% |
| 坏 JSON | 同上 | 返回 null |
| 架构结论 | 同上 | 退出码 1 → ok=false，摘要含最后一行 |
| 命令行 | 手工 | 用 fixture 仓库跑 `--arch`，gate 退出码 1 |

## 预估工时

解析 15 + 渲染 15 + CLI 15 + 测试 15 = **45–75 分钟**。

## 验收记录

- 2026-11-14：`node --test` 64 绿（新增 3 条覆盖率/架构用例）。
- 用 `test/fixtures/coverage.json` 跑插件自身：平均 83.2%，低于 85 → 报告标 **未达标**。
- 用 `test/fixtures/arch-repo`（退出码 1 的假脚本）跑 `--arch --gate`：报告标「有违规」，
  退出码 1。

## 变更记录

| 日期 | 原判断 | 新判断 | 触发原因 |
| --- | --- | --- | --- |
| 11-14 | gate 只看行数与 lint | 加上覆盖率与架构 | 否则「健康」只覆盖结构，覆盖率和既有架构判据成了盲区 |
