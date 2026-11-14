# 诊断扩展：日志取证与卡顿采样（从「看内存」扩到「查隐蔽问题」）

> **Status**: Accepted（用户 2026-11-14 指示扩展诊断能力）
> **起始日期**：2026-11-14
> **预估工时**：60–90 分钟
> **对应提交**：待回填
> **被取代**：—

## 背景 / 问题

内存工具只能回答「多少」。被测项目修完 `code:950` 之后要回答的是另一类问题：
「这条消息为什么没发出去」「这几秒主线程在干什么」「重连有没有风暴」。

2026-11-14 实测确认了两条**不需要 Developer Mode、不需要改 App** 的取证路径：

| 能力 | 现成工具 | 实测结果 |
| --- | --- | --- |
| 结构化日志 | `xcrun simctl spawn <udid> log show --style json` | 5 分钟拿到 299 条，含 timestamp / subsystem / category / eventMessage |
| 调用栈采样 | `sample <pid> 3 -file out.txt` | 模拟器进程 1 秒采样成功，178 KB 文本 |

两条都是系统自带、语义稳定，不需要我们解析协议或 hook 进程。

## 目标与非目标

**目标**

- `ios_log_query { bundleId|pid, lastSeconds, grep, limit }`：取最近 N 秒的 App 日志，
  返回 `{t, subsystem, category, message}`，按关键字过滤。
- `ios_hang_sample { bundleId|pid, seconds }`：对目标进程采 `sample`，返回报告路径
  + 前 80 行预览（主线程调用栈就在里面）。
- 两者都走已有的 pid 解析（`targets.js`），不重复实现。
- 单测覆盖解析层（`parseLogRecords` ≥ 90% 行覆盖）。

**非目标**

- 不做网络抓包：`tshark` 本机没有，抓了也解析不了；**要不要装 Wireshark / 怎么解析，
  单独开 spec 决策**（`tcpdump` + `rvictl` 已验证可用，先只记录）。
- 不做面板 UI：这两个是取证工具，输出给 Agent 和报告。
- 不做崩溃符号化、不做设备日志（`idevicesyslog` 留给下一批）。
- 不改被测项目，不要求 App 加日志。

## 参考实现（Prior art）

- **Apple Unified Logging**：`log show --style json` 是官方结构化出口。
  采用它的字段（timestamp / subsystem / category / eventMessage），不自己发明。
- **`sample`**：系统自带的栈采样器，输出「Call graph + 按栈顶排序」两段。
  采用：只取原始文本，不做栈聚合（那是 Instruments 的活）。
- **不采用 `spindump`**：需要 root，且面向系统级卡顿，App 级用 `sample` 足够。

## 方案

### 第 1 步：`core/logs.js`

- `parseLogRecords(json, { grep, limit })`：纯函数，输入 `log show` 的 JSON 数组，
  输出过滤后的事件。时间字符串转 ISO，解析失败保留原样。
- `queryLogs(sampler, payload)`：解析 pid → 跑 `simctl spawn … log show` → 解析。
- `sampleHangs(sampler, payload)`：解析 pid → 跑 `sample` → 读文件 → 预览。
- **为什么不把逻辑放进 `core/sampler.js`**：采样环是长驻状态机，这两个是「一次性取证」，
  放一起会让 state 边界变模糊（沿用架构整改的结论）。

### 第 2 步：两个工具 entry

- `ios_log_query` / `ios_hang_sample` 加进 `TOOL_SPECS`，DSH 与 MCP 同时生效。
- 参数都支持 `pid` 或 `bundleId`，与 `ios_mem_start` 保持一致。

### 第 3 步：测试

- `test/logs.test.mjs`：grep 过滤、limit 截断、坏 JSON、时间解析、空数组。
- 工具表断言从 9 改成 11。

## 被否决的方案

| 方案 | 否决理由 | 依据 |
| --- | --- | --- |
| 自己写 pcap/HTTP/WS 解析 | 本机没有 tshark，自研解析器维护成本高且容易错 | 用户明确要求优先用现成工具 |
| 用 `xctrace` 代替 `sample` 做卡顿 | 每次录制几十秒、要解析 trace；`sample` 一条命令出栈 | 实测 `sample` 可用 |
| 把日志塞进面板时间轴 | 日志量级是千条/分钟，图表放不下，且与内存采样语义不同 | 面板现有契约 |
| 什么都不做 | 隐蔽问题只能靠猜；内存工具停在「多少」这一层 | 用户已明确要扩 |

## 代价与风险

**代价**：多一个模块与两个工具；日志里可能含用户内容，需要注意不要把敏感串直接贴进报告。

**风险**

| 风险 | 缓解 |
| --- | --- |
| `log show` 大窗口慢（10 分钟以上） | `lastSeconds` 上限 300，超时 30 秒 |
| 日志含用户消息文本 | 工具描述注明「可能含用户内容」，报告里默认不贴全文 |
| `sample` 对已退出 pid 报错 | 复用 `alive` 检查，错误信息给「先确认 App 在跑」 |
| 设备日志格式不同 | 本版只支持模拟器，工具描述写明 |

**回滚**：删 `core/logs.js` + 两个工具 entry，无数据迁移。

## 未决问题

- 网络抓包要不要做、要不要装 tshark？（`rvictl` + `tcpdump` 已验证可用）
- 设备侧日志（`idevicesyslog`）要不要和模拟器统一出口？
- 日志事件要不要进面板时间轴（作为 mark 的补充）。

## 测试计划

| 用例 | target | 断言 |
| --- | --- | --- |
| grep 过滤 | `test/logs.test.mjs` | 只返回包含关键字的记录 |
| limit 截断 | 同上 | 取最后 N 条 |
| 坏 JSON / 空数组 | 同上 | 返回 `[]` 不抛 |
| 时间转 ISO | 同上 | `2026-11-14 15:38:34.365936+0800` → ISO |
| 工具表 | `test/tools.test.mjs` | 11 个、名字唯一 |
| 真机/模拟器 | 手工 | 对 DSHPocket 取日志 + sample 出栈 |

## 预估工时

| 单元 | 小计 |
| --- | --- |
| `core/logs.js`（查询 + 采样 + 解析） | 25 分钟 |
| 两个工具 entry + 文档 | 10 分钟 |
| 测试（5 条）+ 真机验证 | 25 分钟 |
| **合计** | **60–90 分钟** |

## 验收记录

- 2026-11-14：`node --test test/*.test.mjs` 30 绿（新增 5 条日志解析用例）。
- 模拟器实跑 DSHPocket 1.0.8 (10)：
  - `ios_log_query` 30 秒窗口返回 15 条，含 UIKit EventDispatch、CoreAnalytics 等，时间已转 ISO。
  - `ios_hang_sample` 2 秒采样产出 173 KB 报告，主线程栈在 `com.apple.main-thread`，
    同时带 `Physical footprint: 50.5M`（可与内存工具交叉验证）。
- 两个工具都复用系统命令（`log show` / `sample`），没有自研解析器。

## 变更记录

| 日期 | 原判断 | 新判断 | 触发原因 |
| --- | --- | --- | --- |
| 11-14 | 本批同时评估网络抓包 | 先不做，等 `tshark` 依赖决策 | 本机没有 tshark；`tar` 层面解析 pcap 会变成自研解析器 |
