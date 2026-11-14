# DSH Pocket 压力场景内存实测（footprint 口径）

> **项目**：`dsh-pocket-ios`
> **时间**：2026-11-14 14:25
> **设备**：模拟器 DSH Pocket Max（iPhone 17 Pro Max / iOS 26.3），Debug 构建
> **采集**：`dsh-ios-mem` 0.2.0，`ios_mem_start` 500ms，启动后 14–16 秒取稳定段
> **被测仓库改动**：无（本工具只读；场景靠 App 自己的 `DSH_STRESS` 环境变量）

## 摘要

- 六场景 footprint：`extreme 181 > messages:400 121.5 > code:950 100 > steps:80 62 ≈ images:120 57 > sessions:800 38`（MB）。
- 同期 RSS 比 footprint 高 240–300 MB，且几乎不随场景变化——那部分是 dyld 共享缓存与框架干净页，不是 App 自己欠的账。
- `markdown:code:950` 不再崩溃；它的 100 MB 里 43.3 MB 是 **CoreAnimation**，不是字符串或 malloc。

## 数据

| 场景 | footprint 稳定值 | 同期 RSS | 项目基线 RSS | 说明 |
| --- | --- | --- | --- | --- |
| `messages:400` | **121.5 MB** | 427 MB | 400 MB | 800 条裁到 24 条后 |
| `images:120` | **56.6 MB** | 295 MB | 307 MB | 图片走缩略图缓存 |
| `steps:80` | **62.3 MB** | 327 MB | 319 MB | 步骤默认折叠 |
| `markdown:extreme` | **180.9 MB** | 421 MB | 466 MB | 仍然最贵 |
| `markdown:code:950` | **100.1 MB** | 332 MB | 381 MB | 不再崩，进程存活 |
| `sessions:800` | **37.8 MB** | 280 MB | 277 MB | 列表页 |

场景渲染已确认：`images:120` 到「第 120 张图」，`sessions:800` 列表到「压测会话 10」，`code:950` 进程存活。

## 异常与疑点

1. **RSS 与 footprint 排序不一致**：按 RSS，`extreme(466) > messages(400) > code:950(381)`；按 footprint，`extreme(181) > messages(121) > code:950(100)`。增量幅度被 RSS 稀释了约 3 倍。
2. **code:950 的成本在图层**：43.3 MB CoreAnimation / 19 个 region，Malloc 合计只有 18 MB。压缩文本不会降这块内存。
3. **图片与步骤的增量很小**（+19 / +25 MB，相对列表页）：硬裁剪到 24 条后，这两个维度在「进会话」阶段不构成主要成本。

## 给被测项目的排查建议

1. 大代码块：看 `MarkdownBody` 是否一次性把整段代码绘成一个 Text/图层；若可行，按可视区懒渲染或限制单块行数。
2. 极端 Markdown：表格 100 行 × 8 列 + 500 行代码块的组合仍是最高点（181 MB），建议单独拆表测「纯表格」与「纯代码」的边际成本。
3. 基线口径：现有基线表是 RSS；若要和这份对照，建议在项目里补一列 footprint（由项目自己决定，本工具不代改）。
采样窗口取「启动后 14 秒起、稳定 15 秒」。

## 复现方式

```bash
# 项目侧（不改代码）
./scripts/stress-run.sh markdown:code:950

# 工具侧
ios_mem_start { udid, bundleId: "com.ruska.dsh-pocket-ios", intervalMs: 500 }
# 等待 14–16 秒
ios_mem_status { windowSec: 30 }
ios_mem_detail { limit: 8 }
```
