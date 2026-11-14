# iOS 内存面板

把「这台模拟器里的 App 现在有多重、是谁在吃」变成右侧栏里一张能下钻的实时图。

## 解决什么问题

`Instruments` 能看到总量，但要人工开、人工看，进不了日常调试回路；`Xcode` 的 Memory Graph 只在断点那一刻有效。真正调试时反复问的是三个问题：

1. 刚才那个操作让内存涨了多少？
2. 涨的是哪一类（Malloc / CoreAnimation / WebKit）？
3. 再往下，是哪个二进制、哪种 region 在占？

面板按这个顺序回答：时间轴 → 类别 → 镜像/区域标签。

## 数据来源与精度

宿主每秒调用一次 Xcode 的 `footprint`：

| 命令 | 耗时 | 给出 |
| --- | --- | --- |
| `footprint -j` | ~40–100ms | 进程总 footprint、30 个 VM 类别的 dirty 字节数与 region 数 |
| `footprint -v -j` | ~90–150ms | 5000+ 个 region 的 tag、所属二进制、dirty/swapped |

`phys_footprint` 就是 jetsam 判定的那个数，不是 RSS，也不是 `Allocations` 的 total bytes。压缩页在 region 层表现为 `swapped`，合并时按 `dirty + swapped` 计。

这条路径不需要 `task_for_pid`，因此模拟器进程可直接采；`leaks`、`heap`、`vmmap` 需要 Developer Mode，本插件不依赖。

## 怎么用

1. 模拟器跑起 App。
2. 右侧栏「内存」→ 选目标 → 开始。
3. 图上看趋势；鼠标悬停看某一秒的总量与 top 类别；点击锁定某一秒。
4. 下方表格切「类别 / 镜像 / 区域标签」；类别行可点击，把图过滤成单条曲线。
5. 「打点」在时间轴插一条竖向虚线，用于对齐操作。

## 工具（给 AI 用）

| 工具 | 作用 |
| --- | --- |
| `ios_mem_targets` | 列出已启动模拟器与运行中的 App（udid / bundleId / pid） |
| `ios_mem_start` | 开始采样，可只给 udid + bundleId，自动找 pid |
| `ios_mem_status` | 当前/峰值/均值/增量、涨速、top 类别 |
| `ios_mem_detail` | 当前时刻按镜像、按区域标签的排行 |
| `ios_mem_mark` | 打点 |
| `ios_mem_stop` | 停止采样 |
| `ios_mem_launch` | 在模拟器里启动 App |
| `ios_mem_record` | 真机录一段（Activity Monitor，约 1Hz），录完载入面板时间轴 |

## 两个入口，一份内核

| 入口 | 文件 | 谁用 |
| --- | --- | --- |
| DSH 插件 | `index.js` + `client.js` | 右侧栏面板、DSH 内的 Agent |
| MCP server | `bin/mcp.mjs` | Claude Code / Cursor / 其他 harness |

采样、目标发现、明细聚合和工具定义都在 `core.js`，两个入口只是传输层不同（HTTP RPC / stdio JSON-RPC）。因此工具行为不会分叉。

不建议把 MCP 再挂回 DSH：DSH 已有同名原生工具，挂上去只会多出 7 个重名工具和第二个采样进程。

## 限制

- 只支持模拟器。真机进程无法被宿主 attach；真机路径需要 `xctrace` 录制后导入，本版未实现。
- 样本按**时间**保留最近 30 分钟（与采样间隔无关；250ms 间隔时 7200 点是兜底上限）；DSH 重启即清空。
- 不做泄漏检测。`leaks` 需要 `sudo DevToolsSecurity -enable`，且对 Swift 闭包环误报/漏报都多。
- 类别名来自 Xcode 的私有划分，跨 Xcode 版本可能增删；面板按原样显示。
- 采样会每秒 fork 一次 `footprint`，对本机有轻微开销；不需要时请停止。
