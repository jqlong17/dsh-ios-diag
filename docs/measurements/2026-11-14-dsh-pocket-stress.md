# 实测：DSH Pocket 压力场景（2026-11-14）

> 被测项目：`dsh-pocket-ios`。**本文件只是测量记录，工具不修改被测项目。**
> 原始基线（RSS 口径）在 dsh-pocket-ios 的 `docs/architecture/performance-baseline.md`，未改动。
> 采集方式：`ios_mem_start`（500ms，启动后 14–16 秒开始）+ `ios_mem_status` / `ios_mem_detail`。

## footprint 补测（dsh-ios-mem，2026-11-14 14:25）

用 `dsh-ios-mem` 插件重跑同一批场景。**指标换成 `phys_footprint`（jetsam 判定的那个数）**，
采样间隔 500ms，启动后 14–16 秒开始，取稳定段。

> 这一列与上面的 RSS 列**不能直接比**：RSS 含 dyld 共享缓存与框架的干净页，
> 在本机约 240–300 MB，且几乎不随场景变化。footprint 才是这个 App 自己欠的账。

| 场景 | footprint 稳定值 | 同期 RSS | 基线 RSS | 说明 |
| --- | --- | --- | --- | --- |
| `messages:400` | **121.5 MB** | 427 MB | 400 MB | 800 条裁到 24 条后 |
| `images:120` | **56.6 MB** | 295 MB | 307 MB | 图片走缩略图缓存 |
| `steps:80` | **62.3 MB** | 327 MB | 319 MB | 步骤默认折叠 |
| `markdown:extreme` | **180.9 MB** | 421 MB | 466 MB | 仍然最贵 |
| `markdown:code:950` | **100.1 MB** | 332 MB | 381 MB | 不再崩，进程存活 |
| `sessions:800` | **37.8 MB** | 280 MB | 277 MB | 列表页 |

### 这组数说明的三件事

1. **RSS 会骗人。** 列表页 280 MB 里只有 37.8 MB 是 footprint，其余是共享库。
   用 RSS 做基线，绝对值和「相对空载的增量」都会被稀释。
2. **排序变了。** 按 footprint：`extreme 181 > messages 121 > code 100 > steps 62 ≈ images 57 > sessions 38`。
   `images` 和 `steps` 的增量（+19 / +25 MB）比 RSS 表看起来更小。
3. **大代码块的成本在图层，不在字符串。** `markdown:code:950` 的 100 MB 里有
   **43.3 MB 是 CoreAnimation**（19 个 region），Malloc 合计只有 18 MB。
   想降这块内存，方向是减少一次性绘制的行数/图层，而不是压缩文本。

### 怎么复现

```bash
# 面板里选目标后开始，或：
#   ios_mem_start { udid, bundleId, intervalMs: 500 }
#   ios_mem_status / ios_mem_detail
xcrun simctl terminate  <udid> com.ruska.dsh-pocket-ios
SIMCTL_CHILD_DSH_STRESS="markdown:code:950" \
SIMCTL_CHILD_DSH_DEMO=1 SIMCTL_CHILD_DSH_OPEN=demo-1 \
  xcrun simctl launch <udid> com.ruska.dsh-pocket-ios
```

插件会在进程被杀后自动接上新 pid（打一条「App 重新启动」标记），
所以压测循环里不用每次手动重新开始采样。
