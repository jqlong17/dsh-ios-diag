// core/events.js · 统一事件与链接（本体思路的第一批）
//
// 目的不是「再存一份数据」，而是让六种采集结果第一次能躺在同一张表里，
// 并且把「谁和谁是同一件事 / 谁只是时间挨着」写成明确记录。
//
// 两条硬规则（见 spec/2026-11-14-1600-unified-events-links.md）：
//   1. 事件是窄表 + attrs JSON：新增一类数据只加 type，不改表结构。
//   2. 链接必须带 method（id / time）与 confidence：推断出来的链接不能装成事实。
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { bytesToMB } from './util.js'

const ROOT = fileURLToPath(new URL('../', import.meta.url))

/// 事件的最小契约。id 必须带来源前缀（mem: / mark: / log: / stack:），
/// 因为不同来源的序号会撞，前缀是最便宜的命名空间。
export function createEvent(input) {
  if (!input || !input.type) throw new Error('事件必须有 type')
  if (!input.id) throw new Error('事件必须有 id')
  return {
    ts: input.ts || new Date().toISOString(),
    type: input.type,
    id: input.id,
    sessionId: input.sessionId ?? null,
    rpcId: input.rpcId ?? null,
    pid: input.pid ?? null,
    attrs: input.attrs || {},
  }
}

export function memSampleEvent(sample, options = {}) {
  return createEvent({
    ts: new Date(sample.t).toISOString(),
    type: 'mem_sample',
    id: `mem:${sample.seq}`,
    sessionId: options.sessionId ?? null,
    pid: options.pid ?? null,
    attrs: {
      totalMB: bytesToMB(sample.total),
      top: sample.categories && sample.categories[0] ? sample.categories[0].name : null,
    },
  })
}

export function markEvent(mark, options = {}) {
  const ts = typeof mark.t === 'number' ? new Date(mark.t).toISOString() : mark.t
  return createEvent({
    ts,
    type: 'mark',
    id: `mark:${options.index || 1}`,
    sessionId: options.sessionId ?? null,
    attrs: { label: mark.label },
  })
}

export function logEvent(event, options = {}) {
  return createEvent({
    ts: event.t,
    type: 'log',
    id: `log:${options.index || 1}`,
    sessionId: options.sessionId ?? null,
    pid: options.pid ?? null,
    attrs: {
      subsystem: event.subsystem || '',
      category: event.category || '',
      // 日志可能含用户内容：进事件表就截断，报告里默认不贴全文。
      message: String(event.message || '').slice(0, 200),
    },
  })
}

export function stackEvent(info, options = {}) {
  return createEvent({
    ts: new Date().toISOString(),
    type: 'stack',
    id: `stack:${options.index || 1}`,
    sessionId: options.sessionId ?? null,
    pid: options.pid ?? null,
    attrs: { path: info.path, bytes: info.bytes, seconds: info.seconds },
  })
}

/// 第一批只生成两种链接：
/// - 所有事件 → run（method=id，同一次导出的身份证）
/// - 样本 → 最近一次早于它的打点（method=time，只是线索，所以 confidence 0.5）
export function buildLinks(events, runId) {
  const links = []
  const runLink = `run:${runId}`
  for (const event of events) {
    links.push({ from: event.id, type: 'contained_in', to: runLink, method: 'id', confidence: 1 })
  }
  const marks = events
    .filter((event) => event.type === 'mark')
    .sort((a, b) => String(a.ts).localeCompare(String(b.ts)))
  const samples = events.filter((event) => event.type === 'mem_sample')
  for (const sample of samples) {
    let owner = null
    for (const mark of marks) {
      if (String(mark.ts) <= String(sample.ts)) owner = mark
    }
    if (owner) {
      links.push({ from: sample.id, type: 'contained_in', to: owner.id, method: 'time', confidence: 0.5 })
    }
  }
  return links
}

export function serializeJsonl(records) {
  return records.map((record) => JSON.stringify(record)).join('\n') + '\n'
}

function runStamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`
}

/// 把当前一轮采样（+ 可选日志）落成一份可查询的 run。
export async function exportRun(sampler, payload = {}) {
  const runId = runStamp()
  const sessionId = `run:${runId}`
  const events = []

  sampler.session.marks.forEach((mark, index) => {
    events.push(markEvent(mark, { index: index + 1, sessionId }))
  })
  sampler.session.samples.forEach((sample) => {
    events.push(memSampleEvent(sample, { sessionId, pid: sampler.session.target ? sampler.session.target.pid : null }))
  })

  let logCount = 0
  if (payload.includeLogs !== false && sampler.session.target) {
    try {
      const result = await sampler.queryLogs({
        pid: sampler.session.target.pid,
        udid: sampler.session.target.udid,
        lastSeconds: payload.lastSeconds || 120,
        limit: 300,
      })
      result.events.forEach((event, index) => {
        events.push(logEvent(event, { index: index + 1, sessionId, pid: sampler.session.target.pid }))
      })
      logCount = result.events.length
    } catch {
      // 日志是加分项：取不到不影响 run 落盘。
    }
  }

  events.sort((a, b) => String(a.ts).localeCompare(String(b.ts)))
  const links = buildLinks(events, runId)
  const dir = join(ROOT, 'docs', 'measurements', '_runs', runId)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'events.jsonl'), serializeJsonl(events))
  await writeFile(join(dir, 'links.jsonl'), serializeJsonl(links))
  await writeFile(join(dir, 'README.md'), `# run ${runId}

- 事件：${events.length}（内存样本 ${sampler.session.samples.length}、打点 ${sampler.session.marks.length}、日志 ${logCount}）
- 链接：${links.length}（其中 method=time 的推断链接 ${links.filter((link) => link.method === 'time').length} 条）

## 文件

- \`events.jsonl\`：一行一个事件，字段 \`ts/type/id/sessionId/rpcId/pid/attrs\`
- \`links.jsonl\`：一行一条链接，字段 \`from/type/to/method/confidence\`

## 怎么读

- \`method=id\` 的链接是事实（同一个 run / 同一个 rpcId）；
- \`method=time\` 的链接只是「时间挨着」，confidence 0.5，不要当因果；
- 日志 attrs.message 已截断到 200 字，仍可能含用户内容，外发前先检查。
`)

  return {
    ok: true,
    runId,
    dir,
    events: events.length,
    links: links.length,
    inferredLinks: links.filter((link) => link.method === 'time').length,
    hint: '用 cat/rg 查 events.jsonl；报告里引用这个目录的绝对路径即可。',
  }
}
