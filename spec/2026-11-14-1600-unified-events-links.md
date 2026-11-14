# 统一事件表与链接：用本体思路把多源数据串成一条时间线

> **Status**: Accepted（用户 2026-11-14 确认第一批范围）
> **起始日期**：2026-11-14
> **预估工时**：90–150 分钟（分三批，第一批必须先跑通）
> **对应提交**：待回填
> **被取代**：—

## 背景 / 问题

今天我们有五种数据，但它们只在各自的工具里成立：

| 数据 | 有什么 | 缺什么 |
| --- | --- | --- |
| 内存样本 | 时间、总量、类别 | 不知道当时在干什么 |
| 日志事件 | 时间、subsystem、文本 | 不知道和内存/请求的关系 |
| 调用栈 | 时间、栈 | 只是一个孤立快照 |
| 手动打点 | 时间、标签 | 只有标签，没有对象 |
| 真机 trace | 时间、总量、类型 | 录制回放，和上面几项不在一个时间轴 |

「消息没发出去」「内存涨的那一下在干什么」这类问题，本质是**跨数据源的关联**，
而关联需要「链接实例」——现在一条都没有。

用户（PM）的判断：这是多源数据处理问题，可以借用本体（对象类型 / 链接 / 实例 / 属性）的思路。
本文把这个判断落成可执行的第一批。

## 目标与非目标

**目标（第一批）**

- 定义统一事件记录：`{ts, type, id, sessionId, rpcId, pid, attrs}`，所有采集器都写这一种形状。
- 定义链接记录：`{from, type, to, method: "id"|"time", confidence}`。
- 新增 `ios_events_export`：把当前一轮的内存样本 / 打点 / 日志 / 栈，写成一份
  `events.jsonl`（落在插件自己的 `docs/measurements/_runs/<时间>/`），并附一份 `links.jsonl`。
- 链接第一批只做两种：
  - `contained_in`（时间包含：样本落在某个打点区间内）→ `method: "time"`，`confidence: 0.5`
  - `same_session`（同一轮采样，有 `sessionId`）→ `method: "id"`，`confidence: 1`
- 单测覆盖事件/链接的构造与序列化。

**非目标**

- 不做图数据库（Neo4j / 图引擎）；JSONL + 查询函数足够。
- 不改被测 App、不要求它加埋点。
- 不做实时关联 / 自动诊断；第一批只做「事后可查询」。
- 不做网络对象（`RpcRequest` / `WsFrame`）：依赖抓包，单独一批（见未决问题）。

## 参考实现（Prior art）

- **OpenTelemetry**：`trace_id` / `span_id` / `parent_span_id` / `links[]` / `attributes`
  解决的就是「指标、日志、链路怎么串」。采用它的**分层**：ID 能连的用 ID，
  连不上的用 exemplar（样本上挂一个指向具体记录的引用），绝不假装时间相近就是因果。
- **本体（用户项目）**：对象类型 / 对象实例 / 属性 / 链接类型 / 链接实例。
  采用它的**词汇**做对外表达（报告里说「对象」「链接」，比说 span 好懂）。
- **不采用**：把事件建成宽表（每类数据一列）——新增一类就要改表结构，且大部分列永远为空。
  采用「窄表 + `attrs` JSON」：类型是字段，属性放 JSON。

## 方案

### 第 1 步：事件与链接的记录格式

```jsonc
// events.jsonl
{"ts":"2026-11-14T07:39:38.711Z","type":"mem_sample","id":"mem:37","sessionId":"run:20261114-1539",
 "rpcId":null,"pid":58620,"attrs":{"totalMB":195.2,"top":"Malloc Nano"}}

// links.jsonl
{"from":"mem:37","type":"contained_in","to":"mark:3","method":"time","confidence":0.5}
```

- **为什么 `ts` 一律 ISO8601**：设备、电脑、日志三个时钟已经够乱，至少格式要统一。
- **为什么 `id` 要带前缀**（`mem:` / `log:`）：不同来源的 id 可能撞，前缀是最便宜的命名空间。
- **为什么 `method` + `confidence` 必须有**：没有它，推断出来的链接会被当成事实。
- 改动范围：新增 `core/events.js`。

### 第 2 步：采集器适配

- `fromMemSample(sample, sessionId)`、`fromMark(mark, sessionId)`、
  `fromLogEvent(event, sessionId)`、`fromStack(sample, sessionId)`。
- 每个适配器只做「字段搬运 + 单位统一」，不做判断。
- **为什么适配器而不是让采集器直接产出事件**：采集器已经稳定，改它们等于把风险扩散到
  内存/日志两条主链；适配层坏了只影响导出。
- 改动范围：`core/events.js`。

### 第 3 步：导出工具 + 链接生成

- `ios_events_export { runLabel?, includeLogs?, lastSeconds? }`：
  - 生成 `runId = run:<YYYYMMDD-HHMM>`
  - 写 `events.jsonl`、`links.jsonl`、`README.md`（这份 run 包含什么、怎么查询）
  - 返回目录的绝对路径
- 链接生成规则（第一批）：
  - 同一 `runId` 的所有事件之间：`same_session`（method=id）
  - 打点区间内的样本：`contained_in`（method=time，confidence 0.5）
- **为什么先只做这两种**：它们是唯一不依赖额外采集、且不会误导人的链接。
  「日志解释了内存尖峰」这种因果，等有了网络对象和 rpcId 再说。
- 改动范围：`core/events.js`、`core/tools.js`、`core/sampler.js`（委托一行）。

## 被否决的方案

| 方案 | 否决理由 | 依据 |
| --- | --- | --- |
| 直接上图数据库 | 六类对象、上千条事件，SQLite/JSONL 足够；图库引入运维与查询语言成本 | 当前数据量级 |
| 让 App 先加埋点再串 | 工具必须只读；且 App 改完要重新发版，反馈周期从分钟变天 | 用户「不改别的项目」的约束 |
| 用时间相近当因果 | 会把「同时发生」误判成「因为所以」，报告会骗人 | 本体讨论中确认的风险 |
| 每类数据一张宽表 | 新增类型就要迁移表结构 | 同类事件 schema 演进成本 |
| 什么都不做 | 六种数据继续各说各话，报告只能靠人肉对表 | 现状 |

## 代价与风险

**代价**：多一个导出步骤；`links.jsonl` 会随 run 增长（一次 run 约几十 KB，可接受）。

**风险**

| 风险 | 缓解 |
| --- | --- |
| 推断链接被当成事实 | 每条链接必须带 `method` 与 `confidence`；报告里分开展示 |
| 时钟偏差导致顺序错 | 只用同一台机器/同一模拟器的时间；跨设备链接第一批不做 |
| 日志含用户内容被写进 run | 导出时对 `message` 截断 200 字，并在 README 标注「可能含敏感内容」 |
| run 目录无序堆积 | 统一放 `docs/measurements/_runs/`，名带时间戳；`.gitignore` 忽略 |

**回滚**：删 `core/events.js` + 工具 entry，已导出的 run 目录不影响。

## 未决问题

- **网络对象怎么来**：`RpcRequest` / `WsFrame` 需要抓包；本机没有 `tshark`，
  要不要装 Wireshark？不装就只能先做 pcap + 手工看。
- **App 要不要打 `rpcId` 到日志**：网络层抓包能拿到 rpcId，但如果只读日志，
  就需要 App 把 rpcId 写进一行日志。这属于「被测项目自己决定」的改动。
- run 保留多久、要不要自动清理。

## 测试计划

| 用例 | target | 断言 |
| --- | --- | --- |
| 事件构造 | `test/events.test.mjs` | 字段齐全、`ts` 为 ISO、`id` 带前缀 |
| 链接构造 | 同上 | `method` 只能是 `id`/`time`；`time` 时 confidence < 1 |
| 序列化 | 同上 | 每行一个合法 JSON，可被 `JSON.parse` 读回 |
| 打点区间包含 | 同上 | 落在区间内的样本才有 `contained_in` |
| 工具表 | `test/tools.test.mjs` | 12 个工具、名字唯一 |

## 预估工时

| 批次 | 内容 | 小计 |
| --- | --- | --- |
| 1 | `core/events.js` + 导出工具 + 测试 | 60 分钟 |
| 2 | 网络对象（依赖抓包方案） | 另开 spec |
| 3 | 查询/报告（给 rpcId 拉一生） | 另开 spec |
| **第一批合计** | | **90–150 分钟** |

## 验收记录

- 2026-11-14：`node --test test/*.test.mjs` 35 绿（新增 5 条事件/链接用例）。
- 模拟器实跑：采样 24 个点 + 1 个打点 → `ios_events_export` 产出
  `docs/measurements/_runs/20261114-1603/`：
  - `events.jsonl` 25 条（mem_sample 24、mark 1），字段 `ts/type/id/sessionId/rpcId/pid/attrs`；
  - `links.jsonl` 29 条：25 条 `method=id`（同一 run），4 条 `method=time`（打点之后的样本，confidence 0.5）。
- 日志这一轮为 0 条（窗口内 App 没打 os_log），导出不因此失败——日志是加分项。

## 变更记录

| 日期 | 原判断 | 新判断 | 触发原因 |
| --- | --- | --- | --- |
| 11-14 | 打点是一个「点」，样本按时间相近连它 | 打点开一个**区间**（到下一个打点为止） | 只有一个打点时「相近」没有边界；区间语义更稳定，测试也据此断言 |
