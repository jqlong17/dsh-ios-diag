# DSH Pocket 内存采样（统一事件表首跑）

> **项目**：dsh-pocket-ios
> **时间**：2026-11-14 16:22
> **设备**：模拟器
> **采集**：dsh-ios-mem run 20261114-1603
> **原始数据**：/Users/ruska/projects/dsh-plugins/dsh-ios-mem/docs/measurements/_runs/20261114-1603

## 摘要

- 事件 25 条；内存样本 24 个，打点 1 个。
- 内存 50.3 → 50.3 MB（+0%）。

## 数据

| 指标 | 值 |
| --- | --- |
| 事件总数 | 25 |
| 内存样本 | 24 |
| 打点 | 1 |
| 日志 | 0 |
| 日志错误 | 0 |
| 链接（事实/推断） | 25 / 4 |
| 内存 起点 / 终点 | 50.3 / 50.3 MB |
| 内存 峰值 / 谷值 | 50.3 / 50.3 MB |
| 内存 变化 | +0 MB（0%） |

## 异常与疑点

- 打了 1 个点：统一事件表测试。
- 有 4 条时间推断链接（置信度 0.5），它们只是「时间挨着」，不能当因果。

## 给被测项目的排查建议

1. 原始数据在 `/Users/ruska/projects/dsh-plugins/dsh-ios-mem/docs/measurements/_runs/20261114-1603`（events.jsonl / links.jsonl），可用 `ios_events_query` 按 id 查一跳。
2. 本报告由 dsh-ios-mem 生成；被测项目未做任何修改。

## 复现方式

```bash
# 重新导出（采样中的会话）
ios_events_export { lastSeconds: 120 }
# 查这份 run
ios_events_query { dir: "/Users/ruska/projects/dsh-plugins/dsh-ios-mem/docs/measurements/_runs/20261114-1603" }
```
