# iOS 内存面板（dsh-ios-mem）

右侧栏的 iOS 内存实时面板：挑一个正在模拟器里跑的 App，每秒采一次 `footprint`，看趋势、下钻、打点。

## 能做什么

- **时间轴**：堆叠面积图，默认看总量，可按 VM 类别拆开（Malloc Tiny / CoreAnimation / __DATA / WebKit Malloc…）。
- **三层下钻**：
  - 类别：每个样本自带 30 个 VM 类别的字节数，点一行只画这一类。
  - 镜像：按 region 的二进制路径归并（DSHPocket / SwiftUI / UIKitCore…），回答「谁在吃」。
  - 区域标签：`__TEXT`、`__DATA`、`Malloc Small`、`Stack` 这类 region tag。
- **打点**：在时间轴插竖线，把「进会话」「发消息」和内存拐点对齐。
- **统计**：窗口内的当前 / 峰值 / 变化 / 样本数；工具侧还有涨速与占比。

## 数据从哪来

宿主直接调用 Xcode 自带的 `footprint`：

```
footprint -j <tmp> <pid>      # ~40ms，总量 + 类别
footprint -v -j <tmp> <pid>   # ~90ms，5000+ region 的 tag / 镜像 / 字节
```

这条路径**不需要 task_for_pid**，所以模拟器里的 App 可以直接采（`leaks` / `heap` / `vmmap` 反而需要 Developer Mode，本插件不依赖它们）。

## 用法

1. 模拟器里跑起 App（`xcrun simctl launch <udid> <bundleId>`）。
2. 右侧栏打开「内存」，下拉里选目标（模拟器名 · App 名）。
3. 点「开始」。1 秒一个点；「打点」可插标记。
4. 点图上的某一点 → 下面表格换成那一秒的类别结构；再点某一行 → 图只画这一类。

也可以用工具驱动：`ios_mem_targets` → `ios_mem_start` → `ios_mem_status` / `ios_mem_detail` / `ios_mem_mark`。

## MCP

同一份内核（`core.js`）另带一个 stdio MCP server，给 DSH 之外的客户端用：

```json
{ "mcpServers": { "ios-mem": { "command": "node", "args": ["<目录>/bin/mcp.mjs"] } } }
```

工具与插件里的 7 个完全一致。**不建议再把它挂回 DSH**——DSH 已经有同名原生工具，挂上去只会多一份采样进程。详见 [docs/MCP.md](docs/MCP.md)。

## 真机

真机进程没有 `task_for_pid`，宿主 attach 不了；用 `xctrace` 的 Activity Monitor 模板录一段再回放：

- `ios_mem_record { bundleId, seconds }`：录 3–120 秒（约 1Hz），录完直接载入面板，状态显示「已导入真机录制」。
- `ios_mem_types { bundleId, seconds }`：录 Allocations，按分配类型给 live bytes 排行；VM 预留不计入。
- 不需要改 App，也不需要 Debug 包；录制是一次性的，不是实时。

限制：Activity Monitor 只给总量和 resident / compressed / anonymous，**没有类别与镜像下钻**——
那需要 Allocations 模板，本版没做。

## 只读边界（重要）

本工具**只读**被测项目：

- 采样/录制只发生在设备或进程侧（`footprint`、`xctrace`），临时文件写在 `$TMPDIR` 并即删。
- 不修改被测仓库的任何文件——包括它的基线文档。压测结果写在本仓库 `docs/measurements/`。
- 场景切换靠 App 自己支持的环境变量（如 `DSH_STRESS`），工具只负责 `simctl launch`，不改 App 代码。

## 结构

| 位置 | 作用 |
| --- | --- |
| `core/util.js` | 无状态工具：exec、字节换算、region 拆分 |
| `core/trace.js` | xctrace：真机设备、sysmon 解析、录制编排 |
| `core/targets.js` | 模拟器列表 / 运行中 App / 启动 App |
| `core/sampler.js` | 采样状态机（唯一有状态的东西） |
| `core/tools.js` | 工具表（DSH 与 MCP 共用） |
| `core.js` | 上面 5 个模块的 re-export |
| `index.js` | DSH 插件：HTTP RPC + 原生工具 |
| `client/` | 面板源码（6 段，`npm run build:client` 拼成 `client.js`） |
| `client.js` | **生成物**，不要直接改 |
| `bin/mcp.mjs` | MCP server（newline-delimited JSON-RPC，无 SDK 依赖） |

改面板的流程：改 `client/*.js` → `npm run build:client` → `npm test`。

## 边界

- **只支持模拟器**。真机进程没有 `task_for_pid`，宿主 attach 不了；要看真机得走 `xctrace record` 录完再导入，本版没做。
- 不检测泄漏（`leaks` 需要 `sudo DevToolsSecurity -enable`，且对 Swift 闭包环漏报）。
- 样本只存在内存里，插件卸载或 DSH 重启就没了；按时间保留最近 30 分钟（改采样间隔不会变短）。
- `footprint` 的类别名是 Xcode 的私有划分，跨版本可能变；面板按名字显示，不硬编码语义。
