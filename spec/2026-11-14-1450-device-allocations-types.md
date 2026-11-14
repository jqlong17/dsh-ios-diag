# 真机 Allocations 类型下钻：把「谁在吃」从总量推进到分配类型

> **Status**: Accepted（用户 2026-11-14 确认按建议继续）
> **起始日期**：2026-11-14
> **预估工时**：60–90 分钟（按单元累加，见文末）
> **对应提交**：（Accepted 后回填）
> **被取代**：—

## 背景 / 问题

真机录制（`ios_mem_record`）已经能用，但它走的是 Activity Monitor 模板，只给总量和
`resident / compressed / anonymous`。2026-11-14 14:45 的 10 秒录制里，面板只能回答
「这个 App 现在 86.5 MB」，回答不了「这 86.5 MB 里图片占多少、文本占多少」。

这次录制暴露了另一个事实：**同一个 Allocations 模板的 Statistics 表里其实已经有类型粒度**。
实测导出 539 KB、2677 行，类别包括：

| category | persistent-bytes |
| --- | --- |
| `All Heap Allocations` | 15.1 MB |
| `_DictionaryStorage<ObjectIdentifier, AnyTrackedValue>` | 有独占行 |
| `VM: _SwiftUILayerDelegate (CALayer)` | 有独占行 |
| `SwiftUI.KeyboardShortcutBridge` | 有独占行 |
| `Malloc 16.00 KiB` | 2.2 MB |

也就是说：**数据已经录到了，缺的是解析和出口**。现在这个能力只能靠人打开 Instruments 看。

## 目标与非目标

**目标**（可量化）

- 新增纯函数 `parseAllocationStatistics(xml)`：输入 `xctrace export` 的 Statistics XML，
  输出按 `persistent-bytes` 降序的 `{ category, liveMB, liveCount, totalMB, totalCount }[]`。
- 新增工具 `ios_mem_types { bundleId, seconds }`：真机录 3–120 秒 → 返回前 N 个类型 + 总量。
- 解析层单测覆盖 ≥ 90%（`allocations.js` 行覆盖），全量 `npm test` 绿。
- 真实设备跑一次，返回结果与 Instruments 打开同一份 trace 的排序一致（人工抽查前 5 行）。

**非目标**（这次明确不动）

- 不进面板 UI。类型表是「录制结束时的一次快照」，和面板现有「每秒一条样本」的时间轴语义不同，
  硬塞进「镜像」tab 会误导。
- 不做逐秒的类型时间序列（需要重放 40 万条 alloc/free 事件）。
- 不覆盖模拟器（模拟器已有 `ios_mem_detail` 的镜像/区域下钻）。
- 不做泄漏判定：`persistent-bytes` 是「结束时仍活着」，不等于泄漏。

## 参考实现（Prior art）

- **Xcode Instruments 的 Allocations → Statistics**：按 category 聚合，列为
  Persistent Bytes / # Persistent / Total Bytes / # Total。本次直接复刻它的口径
  （persistent = 录制结束时仍存活），不自己发明指标。
- **`xcrun xctrace export --toc`**：官方命令行入口；表的层级是
  `run/tracks/track[@name="Allocations"]/details/detail[@name="Statistics"]`，
  不是 `data/table`。这是本次最关键的格式事实（试出来的，不写在帮助里）。
- **不采用**：`Allocations List`（逐条事件）。10 秒就 44.8 万条，导出约 100 MB，
  解析成本远高于 v1 的收益；留给「逐秒类型曲线」那次再用。

## 方案

### 第 1 步：新模块 `core/allocations.js`（纯解析 + 录制编排）

- 做什么：`parseAllocationStatistics(xml)`（纯函数）+ `recordAllocations(payload)`（调 xctrace）。
- **为什么新开文件**：`core.js` 已经 750+ 行，超过规范 400 行上限；新代码按职责进新模块，
  不再加重存量债务。存量拆分单独排期（见未决问题）。
- **为什么不放进 `core.js`**：这是本次唯一新增的解析器，独立文件可以独立测、独立删。
- 改动范围：新增 `core/allocations.js`。

### 第 2 步：`core.js` 挂一个工具出口

- 做什么：在 `TOOL_SPECS` 里加 `ios_mem_types`，`handler` 委托给 `allocations.recordAllocations`。
- **为什么只改工具表**：采样内核、面板 RPC、MCP 三个入口都从 `TOOL_SPECS` 派生，
  加一条 entry 三处同时生效，不用改三遍。
- **为什么不复用 `ios_mem_record`**：两者模板不同、产物语义不同（时间轴 vs 快照），
  合并会让参数变成「模板开关」，调用方还得自己判断返回值形状。
- 改动范围：`core.js`（+约 30 行）、`package.json`（加 `scripts.test`）。

### 第 3 步：测试先红后绿

- 做什么：`test/allocations.test.mjs` + `test/fixtures/allocations-statistics.xml`（裁剪版，约 20 行）。
- **为什么用 fixture 而不是真实 539 KB**：真实表每次录制数量都变，断言会漂；fixture 只保留
  「正常行 / HTML 实体 / 缺属性 / 空表」四种形状，钉的是解析契约。
- 改动范围：新增 `test/`。

## 被否决的方案

| 方案 | 否决理由 | 否决依据 |
| --- | --- | --- |
| 用 `Allocations List` 逐条事件重放，算逐秒 live bytes | 10 秒 44.8 万条、导出约 100 MB，解析与内存成本远超收益 | 本次实测 trace 大小与事件数 |
| 把类型表塞进面板「镜像」tab | 面板 tab 语义是「此刻的实时明细」，类型表是「录制结束的快照」，混用会误导 | 现有 `ios_mem_detail` 的契约 |
| 继续只做 Activity Monitor | 只有总量，回答不了「谁在吃」，这次需求的核心就没解决 | 2026-11-14 14:45 的录制 |
| 什么都先不做 | 真机类型问题只能靠人开 Instruments，插件价值停在一半 | 用户已明确选择「做类型下钻」 |

## 代价与风险

**代价**
- 新增约 200 行（模块 + 测试），多一个需要维护的 XML 契约。
- 每次调用要真机录 N 秒（默认 10 秒），期间 App 会被重新 launch。

**风险**

| 风险 | 缓解 |
| --- | --- |
| Xcode 升级后 detail 名不再是 "Statistics" | 解析入口先查 TOC，找不到时抛明确错误并提示模板名，不静默返回空 |
| 类别名含 `&amp;` 等实体，直接比较会错 | 解析时做最小实体解码，fixture 覆盖 |
| 667 个「All …」汇总行混进类型排行 | 过滤以 `All ` 开头的汇总行，只留叶子类别 |
| 录制把手机上正在看的界面刷掉 | 工具描述写明「会 relaunch」，默认 10 秒 |

**回滚**：删 `allocations.js` + 工具 entry + 测试目录即可，无数据迁移、无面板改动。

## 未决问题

- 类型表要不要逐秒化？要的话得重放事件，或用 `tick` 表对齐，工作量另算。
- `core.js`（750 行）/`client.js`（800 行）都超 400 行上限；`client.js` 是 loader 单文件产物，
  不能拆。需要一份专门的重构 spec 决定「怎么拆 / 哪些豁免」。
- 类型表里 `VM: …` 与 `Malloc 16.00 KiB` 是不同抽象层级，排行混排是否合理，等真实数据再看。

## 测试计划（先红后绿）

| 用例 | target | 断言 |
| --- | --- | --- |
| 正常表按 live bytes 降序 | `test/allocations.test.mjs`（`node:test`） | 第 1 行是最大项，且 MB 换算正确 |
| HTML 实体解码 | 同上 | `&amp;` / `&lt;` 变成 `&` / `<` |
| 缺 `persistent-bytes` 的行被跳过 | 同上 | 输出不含该行，不抛错 |
| 空表 / 非 XML | 同上 | 返回 `[]`，不抛 |
| 汇总行过滤 | 同上 | `All Heap Allocations` 不出现在 top 列表 |
| 全量回归 | `npm test` | 退出码 0 |
| 覆盖率 | `node --test --experimental-test-coverage` | `allocations.js` 行覆盖 ≥ 90% |
| 真机实测 | 手工 | 返回 top 5 与 Instruments 同 trace 排序一致 |

## 预估工时

| 单元 | 数量 | 单耗依据 | 小计 |
| --- | --- | --- | --- |
| 解析器 + 实体解码 | 1 | 同类 XML 解析约 25 | 25 分钟 |
| 录制编排（xctrace 调用 + 错误分支） | 1 | 复用已有 recordTrace 经验 | 20 分钟 |
| 工具 entry + package 脚本 | 1 | 约 10 | 10 分钟 |
| fixture + 5 条测试 | 1 | 写测试比实现慢 | 20 分钟 |
| 真机验证 + 文档 | 1 | 约 10 | 10 分钟 |
| **合计** | | | **60–90 分钟**（baseline 记 75） |

## 验收记录

- 2026-11-14：`node --test test/*.test.mjs` 25 绿（新增 7 条 allocations 用例）。
- 真机 iPhone 17 Pro（iOS 27.3）两次实测：
  - 列表态：heap 15.5 MB / 匿名 VM 3.0 MB / 预留 0；top 类型 `Malloc 16.00 KiB` 2.2 MB。
  - 会话态：heap 32.1 MB / 匿名 VM 23.4 MB / 预留 2048 MB；top 类型 `VM: _SwiftUILayerDelegate` 10.8 MB。
- 与 Instruments 打开同一 trace 的 Statistics 排序一致（人工抽查前 5 行）。

## 变更记录

| 日期 | 原判断 | 新判断 | 触发原因 |
| --- | --- | --- | --- |
| 11-14 | 类型排行包含 Statistics 里所有非 All 行 | 排除 `VM: …Reservations`，单独 `reservedMB` | 真机首测 `VM: JS VM Reservations` 2048 MB，把总量拉到 2128 MB；那是地址空间不是物理占用 |
| 11-14 | 只给一个 `totalMB` | 拆成 `heapMB` / `anonymousVMMB` / `reservedMB` | 同上：单个 total 会被 2 GB 预留污染，模型会当成真实占用 |
