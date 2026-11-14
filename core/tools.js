// core/tools.js · 工具表（DSH 原生工具与 MCP 共用同一份定义）
//
// handler 返回纯 JSON；DSH 直接渲染成文本，MCP 包成 content[type=text]。
import { clamp, bytesToMB } from './util.js'

// ------------------------------------------------------------ 工具定义（两个入口共用）
//
// handler 返回纯 JSON；DSH 直接渲染成文本，MCP 包成 content[type=text]。

export const TOOL_SPECS = [
  {
    name: 'ios_mem_targets',
    description: '列出已启动的 iOS 模拟器，以及每个模拟器里正在运行的 App（bundleId + pid）。做内存采样前先用它选目标。',
    properties: {},
    async handler(sampler) {
      const targets = await sampler.listTargets({})
      return {
        ok: true,
        devices: targets.devices.map((device) => ({
          udid: device.udid,
          name: device.name,
          runtime: device.runtime,
          apps: device.apps.map((app) => ({ bundleId: app.bundleId, name: app.name, pid: app.pid })),
        })),
        hint: '把 udid + bundleId（或 pid）传给 ios_mem_start 开始采样。',
      }
    },
  },
  {
    name: 'ios_mem_start',
    description: '开始对模拟器里的某个 App 采样内存：默认每 1000ms 一次 footprint，保留最近 30 分钟（按时间裁，改间隔也还是 30 分钟）。传 udid + bundleId 会自动找 pid。',
    properties: {
      udid: { type: 'string', description: '模拟器 udid（来自 ios_mem_targets）。' },
      bundleId: { type: 'string', description: 'App 的 bundle id；不传则必须传 pid。' },
      pid: { type: 'integer', description: '直接指定进程 pid。' },
      intervalMs: { type: 'integer', description: '采样间隔毫秒，250–10000，默认 1000。' },
    },
    async handler(sampler, args) {
      await sampler.startFromPayload(args)
      return { ok: true, ...sampler.statusReport(10), hint: '采样已开始。需要标注某个操作，用 ios_mem_mark。' }
    },
  },
  {
    name: 'ios_mem_stop',
    description: '停止当前内存采样，保留已采到的样本。',
    properties: {},
    async handler(sampler) {
      sampler.stop()
      return { ok: true, ...sampler.statusReport(60), hint: '已停止；样本还在内存里，重新开始会清空。' }
    },
  },
  {
    name: 'ios_mem_status',
    description: '看当前采样状态：最近窗口的当前/峰值/均值/增量、涨速、以及此刻占比最高的 VM 类别。不开采样也能看上次的状态。',
    properties: {
      windowSec: { type: 'integer', description: '统计窗口秒数，默认 60。' },
    },
    async handler(sampler, args) {
      return sampler.statusReport(args.windowSec || 60)
    },
  },
  {
    name: 'ios_mem_mark',
    description: '在时间轴上打一个标记（例如「进入会话」「发送消息」），面板会画一条竖线。打点后最好记下时间，方便和事件对齐。',
    properties: {
      label: { type: 'string', description: '标记文字，最多 60 字。' },
    },
    async handler(sampler, args) {
      const result = sampler.mark(args)
      return { ok: true, ...result, hint: '已打点。' }
    },
  },
  {
    name: 'ios_mem_detail',
    description: '当前时刻的结构明细：按加载镜像（DSHPocket / SwiftUI / UIKitCore…）和按区域标签（__TEXT / Malloc Small / CoreAnimation…）各给前 20 名，单位 MB。用于回答「到底是谁在吃内存」。',
    properties: {
      limit: { type: 'integer', description: '每个维度返回多少行，默认 20，最大 40。' },
    },
    async handler(sampler, args) {
      const detail = await sampler.detail()
      const limit = clamp(Number(args.limit) || 20, 1, 40)
      return {
        ok: true,
        at: new Date(detail.at).toISOString(),
        totalMB: bytesToMB(detail.total),
        regions: detail.regions,
        imagesTotalMB: bytesToMB(detail.imagesTotal),
        images: detail.images.slice(0, limit).map((row) => ({
          name: row.name,
          MB: bytesToMB(row.bytes),
          percent: Math.round(row.bytes / Math.max(1, detail.imagesTotal) * 1000) / 10,
        })),
        tagsTotalMB: bytesToMB(detail.tagsTotal),
        tags: detail.tags.slice(0, limit).map((row) => ({
          name: row.name,
          MB: bytesToMB(row.bytes),
          regions: row.regions,
          percent: Math.round(row.bytes / Math.max(1, detail.tagsTotal) * 1000) / 10,
        })),
        hint: '镜像只统计带二进制路径的 region（代码/常量段）；堆内存没有路径，看 tags 或类别。',
      }
    },
  },
  {
    name: 'ios_mem_record',
    description: '在已连接的真机上录一段内存（Activity Monitor 模板，约 1Hz），录完直接载入面板时间轴。不需要改 App；真机进程无法 attach，所以这是录制回放而不是实时。',
    properties: {
      bundleId: { type: 'string', description: '真机上 App 的 bundle id，例如 com.ruska.dsh-pocket-ios。' },
      seconds: { type: 'integer', description: '录制秒数，3–120，默认 10。' },
      udid: { type: 'string', description: '设备 udid；不传则用第一台已连接的真机。' },
    },
    async handler(sampler, args) {
      return sampler.recordTrace(args)
    },
  },
  {
    name: 'ios_mem_types',
    description: '真机上录一段 Allocations（默认 10 秒），返回按分配类型聚合的 live bytes 排行（_DictionaryStorage / Malloc 16KiB / SwiftUI 图层…）。回答「这 100MB 到底是谁在吃」。VM 预留（如 JavaScriptCore 的 2GB 地址空间）不计入排行，单独给 reservedMB。会重新 launch 目标 App。',
    properties: {
      bundleId: { type: 'string', description: '真机上 App 的 bundle id。' },
      seconds: { type: 'integer', description: '录制秒数，3–120，默认 10。' },
      limit: { type: 'integer', description: '返回前多少行，默认 20，最大 100。' },
      udid: { type: 'string', description: '设备 udid；不传则用第一台已连接的真机。' },
    },
    async handler(sampler, args) {
      return sampler.recordAllocations(args)
    },
  },
  {
    name: 'ios_log_query',
    description: '取模拟器里某个 App 最近 N 秒的统一日志（log show --style json），可按关键字过滤。排查「消息没发出去 / 重连风暴 / 协议错误」时先看这个。只支持模拟器。',
    properties: {
      bundleId: { type: 'string', description: 'App 的 bundle id；和 pid 二选一。' },
      pid: { type: 'integer', description: '进程 pid；已知时优先。' },
      udid: { type: 'string', description: '模拟器 udid；不传则自动找。' },
      lastSeconds: { type: 'integer', description: '回看窗口秒数，5–300，默认 60。' },
      grep: { type: 'string', description: '只保留 message 包含这个子串的记录（大小写不敏感）。' },
      limit: { type: 'integer', description: '最多返回多少条，默认 200。' },
    },
    async handler(sampler, args) {
      return sampler.queryLogs(args)
    },
  },
  {
    name: 'ios_hang_sample',
    description: '对模拟器里的 App 采 N 秒调用栈（system sample），返回报告路径与前 80 行。查「卡住 / 转圈」时用：主线程栈就在报告里（搜 com.apple.main-thread）。',
    properties: {
      bundleId: { type: 'string', description: 'App 的 bundle id；和 pid 二选一。' },
      pid: { type: 'integer', description: '进程 pid。' },
      udid: { type: 'string', description: '模拟器 udid。' },
      seconds: { type: 'integer', description: '采样秒数，1–10，默认 3。' },
    },
    async handler(sampler, args) {
      return sampler.sampleHangs(args)
    },
  },
  {
    name: 'ios_events_export',
    description: '把当前这一轮的内存样本、打点、日志导出成统一事件表（events.jsonl + links.jsonl），落在插件仓库的 docs/measurements/_runs/<时间>/，返回绝对路径。链接分「id 事实」和「time 推断」两种，不要混用。',
    properties: {
      lastSeconds: { type: 'integer', description: '顺带取多久的日志，默认 120 秒。' },
      includeLogs: { type: 'boolean', description: '是否包含日志，默认 true；日志可能含用户内容。' },
    },
    async handler(sampler, args) {
      return sampler.exportRun(args)
    },
  },
  {
    name: 'ios_events_query',
    description: '查一份导出的 run：给 id（如 mem:12）或 rpcId，返回它一跳内的对象与链接；不给条件则返回这份 run 的索引。链接分 facts（method=id 的事实）与 inferred（method=time 的推断）。',
    properties: {
      runId: { type: 'string', description: 'run 目录名，如 20261114-1603；不传则用最新一份。' },
      dir: { type: 'string', description: 'run 目录的绝对路径（优先级高于 runId）。' },
      id: { type: 'string', description: '事件 id，带前缀：mem: / mark: / log: / stack:。' },
      rpcId: { type: 'string', description: '按 rpcId 查（需要网络对象，当前通常为空）。' },
    },
    async handler(sampler, args) {
      return sampler.queryRun(args)
    },
  },
  {
    name: 'ios_mem_launch',
    description: '在指定模拟器里启动一个 App（simctl launch），方便先起 App 再采样。',
    properties: {
      udid: { type: 'string', description: '模拟器 udid。' },
      bundleId: { type: 'string', description: 'App 的 bundle id。' },
    },
    async handler(sampler, args) {
      return { ok: true, ...(await sampler.launch(args)) }
    },
  },
]

/// 工具参数 → JSON Schema（MCP 与 DSH 都用同一份）。
export function toolInputSchema(spec) {
  return {
    type: 'object',
    properties: spec.properties || {},
    additionalProperties: false,
  }
}
