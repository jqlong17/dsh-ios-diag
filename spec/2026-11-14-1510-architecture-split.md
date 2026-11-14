# 插件架构整改：把 834 行的 core.js 与 884 行的 client.js 拆成可读单元

> **Status**: Accepted（用户 2026-11-14 指令「先优化代码架构」）
> **起始日期**：2026-11-14
> **预估工时**：60–90 分钟
> **对应提交**：（完成后回填）
> **被取代**：—

## 背景 / 问题

《代码编写执行规范》原则三给了量化阈值：**单文件 400 行、单类型约 150 行**。插件当前状态：

| 文件 | 行数 | 问题 |
| --- | --- | --- |
| `core.js` | 834 | 混了 5 类职责：进程工具、trace 解析、采样状态机、目标发现、工具定义 |
| `client.js` | 884 | 混了 6 类职责：locale、RPC、图表、列表、面板、注册 |
| `index.js` | 137 | 合格，不动 |

后果不是「不好看」，是**改动成本**：加一个 `ios_mem_types` 工具要在一份 800 行文件里定位三处；
新参与的人（或另一个 AI）读 `core.js` 必须先分辨哪些是纯函数、哪些会改状态。

## 目标与非目标

**目标**

- `core.js` 拆成 `core/{util,trace,targets,sampler,tools}.js`，**每个 < 400 行**；`core.js` 只做 re-export。
- `client.js` 拆成 `client/*.js` 源文件 + 零依赖拼接脚本 `scripts/build-client.mjs`，每个源文件 < 400 行；
  产物仍是单文件 classic script（loader 只接受这种形态）。
- **行为零变化**：拆分前后 `npm test`、三个冒烟脚本（host / mcp / mount）结果一致。
- 新增 `npm test`（`node --test`），先用测试把现有纯函数的行为钉住，再动结构。

**非目标**

- 不改任何对外行为：工具名、参数、返回值、面板 DOM、RPC 协议都不动。
- 不优化性能、不改算法。
- 不引入第三方依赖（不用 bundler、不装 esbuild）。
- 不顺手修 bug；发现的问题记进「未决问题」。

## 参考实现（Prior art）

- **Cordis / DSH 插件本身**：`index.js` + `client.js` 两文件结构，client 是 loader 单文件产物。
  采用它的产物形态，不采用「一个文件装所有职责」的组织方式。
- **Node 的 `node:test`**：标准库自带 runner + `--experimental-test-coverage`，不引 vitest/jest。
  采用：零依赖、直接跑 ESM。
- **不采用 esbuild/rollup**：为 6 个纯函数文件引入构建链，维护成本高于收益；
  拼接（ordered concat）足够，因为各部分共享同一函数作用域。

## 方案

### 第 1 步：先用测试钉住现有行为

- 做什么：`test/{util,trace,tools,sampler}.test.mjs`，覆盖 `splitRegion`、`parseSysmonTrace`、
  `TOOL_SPECS` 形状、`summarize/snapshot/mark` 的边界。
- **为什么先测试**：重构的验收标准是「行为不变」，没有测试就只能靠肉眼对比 834 行。
- **为什么不是 TDD 的红**：重构不改行为，测试写出来应当**立刻绿**；红说明测试写错了。
- 改动范围：新增 `test/`、`package.json` 的 `scripts.test`。

### 第 2 步：拆 core.js

| 新文件 | 装什么 | 为什么这么切 |
| --- | --- | --- |
| `core/util.js` | `exec`、`clamp`、`bytesToMB`、`alive`、`splitRegion`、`topRows` | 无状态工具，谁都能用 |
| `core/trace.js` | `parseSysmonTrace`、`recordTrace(sampler, payload)`、`physicalDevices()` | 解析 + xctrace 编排，和实时采样无关 |
| `core/targets.js` | `listTargets`、`displayNames`、`findRunningApp`、`launchApp` | 只读系统状态，不碰采样环 |
| `core/sampler.js` | `MemorySampler`（采样环、明细、汇总、打点） | 唯一有状态的东西 |
| `core/tools.js` | `TOOL_SPECS`、`toolInputSchema` | 纯数据 + handler 表 |
| `core.js` | re-export | 保持 `import ... from './core.js'` 不变 |

- **为什么保留 `core.js`**：`index.js` / `bin/mcp.mjs` / 测试都从它 import；保留 shim 让这次重构
  只动内部结构，不动入口。
- **为什么不把 trace 方法留在 class 里**：那会让 `sampler.js` 又回到 500 行。
  改成 `recordTrace(sampler, payload)` 自由函数，class 里只留一行委托。
- 改动范围：`core.js` 拆为 6 个文件。

### 第 3 步：拆 client.js

- 做什么：`client/{00-locale,10-rpc,20-chart,30-panel,90-register}.js`，
  `scripts/build-client.mjs` 按文件名排序拼接进 loader 外壳，输出 `client.js`。
- **为什么用拼接而不是模块化**：loader 只执行 `__ModuleLoader__.load({factory})`，
  factory 内部不能有 `import`；各段共享同一作用域，顺序拼接即可，零依赖。
- **为什么产物要提交**：DSH 直接读 `client.js`，不跑构建；仓库里必须有可用产物。
- **怎么防止手改产物**：`client.js` 顶部加「由 build-client.mjs 生成，改动请改 client/」。
- 改动范围：`client/`、`scripts/build-client.mjs`、`client.js`（生成物）。

## 被否决的方案

| 方案 | 否决理由 | 依据 |
| --- | --- | --- |
| 只拆 core.js，client 保持 884 行 | 最大的文件没动，等于没解决主要矛盾 | 行数统计 |
| 给 client 引入 esbuild | 为 6 个文件加构建依赖与 lockfile，收益不成比例 | 无外部依赖是当前插件的优势 |
| 把 client 改成 ESM 多文件让 loader 支持 | loader 不支持，改了就跑不起来 | `__ModuleLoader__` 形态 |
| 什么都不做 | 加一个工具要在 800 行里改三处，改动成本继续上升 | 本次加 `ios_mem_types` 的实际体验 |

## 代价与风险

**代价**
- 多一层 `core.js` re-export，跳转多一次。
- `client.js` 变成生成物，必须记得跑构建（脚本会在产物头部写警告）。

**风险**

| 风险 | 缓解 |
| --- | --- |
| 拆分时漏搬函数导致运行时 undefined | 先跑测试与冒烟脚本；拆分后逐文件 `node --check` |
| client 拼接顺序错，函数提升掩盖问题 | 只用 `var`/`function` 声明；构建脚本按固定顺序；冒烟挂载测试 |
| 两处入口 import 路径变化 | 保留 `core.js` shim，入口文件零改动 |

**回滚**：`git revert` 单个提交即可，无数据迁移。

## 未决问题

- `client.js` 产物 884 行仍超 400 行，但它是 loader 单文件产物；拆的是**源文件**，
  产物行数不作为判据。这条要在规范里写成明确豁免，否则以后还会被拿出来讨论。
- `TOOL_SPECS` 里 handler 都是内联 async，未来工具多了要不要拆到 `tools/` 目录。

## 测试计划（先绿后重构）

| 用例 | target | 断言 |
| --- | --- | --- |
| `splitRegion` 三种形状 | `test/util.test.mjs` | 带路径 / 无路径 / 空串 |
| `parseSysmonTrace` 正常 + 缺列 | `test/trace.test.mjs` | 样本数、footprint 值、缺列抛错 |
| 工具表形状 | `test/tools.test.mjs` | 8 个工具、名字唯一、都有 handler |
| 采样状态机 | `test/sampler.test.mjs` | since 过滤、mark 空 label 报错、clear 归零 |
| 全量 | `npm test` | 退出码 0 |
| 冒烟 | 手工 | host / mcp / mount 三脚本通过 |
| 拆分阈值 | `wc -l core/*.js client/*.js` | 每个 < 400 |

## 预估工时

| 单元 | 数量 | 单耗 | 小计 |
| --- | --- | --- | --- |
| 测试 4 个文件 + fixture | 1 | 约 25 | 25 分钟 |
| 拆 core（5 模块 + shim） | 1 | 约 20 | 20 分钟 |
| 拆 client（5 文件 + 构建脚本） | 1 | 约 25 | 25 分钟 |
| 全量验证 + 回填 | 1 | 约 10 | 10 分钟 |
| **合计** | | | **60–90 分钟** |
