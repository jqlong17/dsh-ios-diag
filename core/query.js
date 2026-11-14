// core/query.js · 事件查询（「一条消息的一生」）
//
// 只读 core/events.js 产出的 run 目录，不碰采集。查询语义只有两种：
//   - 给 id / rpcId：以它为中心取一跳邻居与边
//   - 不给：返回这份 run 的索引（类型计数 + 最后几条）
//
// 边永远分 facts（method=id）与 inferred（method=time）两组返回，
// 合并成一个数组迟早会被当成「都是事实」。
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const RUNS_DIR = join(ROOT, 'docs', 'measurements', '_runs')

/// 一行一个 JSON；坏行跳过而不是整份失败——导出中断时也能查已有的部分。
export function parseJsonl(text) {
  const rows = []
  for (const line of String(text || '').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const parsed = JSON.parse(trimmed)
      if (parsed && typeof parsed === 'object') rows.push(parsed)
    } catch {
      // 跳过坏行
    }
  }
  return rows
}

export function summarizeEvents(events) {
  const counts = {}
  for (const event of events) {
    const type = event.type || 'unknown'
    counts[type] = (counts[type] || 0) + 1
  }
  return counts
}

/// 一跳邻居。节点只包含「本身也是事件」的，run:xxx 这种伪对象只出现在边上。
export function selectNeighborhood(events, links, query = {}) {
  const byId = new Map(events.map((event) => [event.id, event]))
  let centers = []
  if (query.id) centers = events.filter((event) => event.id === query.id)
  else if (query.rpcId) centers = events.filter((event) => event.rpcId === query.rpcId)

  if (!centers.length) {
    return { centers: [], nodes: [], facts: [], inferred: [], empty: true }
  }

  const centerIds = new Set(centers.map((event) => event.id))
  const facts = []
  const inferred = []
  for (const link of links) {
    if (!centerIds.has(link.from) && !centerIds.has(link.to)) continue
    if (link.method === 'id') facts.push(link)
    else inferred.push(link)
  }

  const nodeIds = new Set(centerIds)
  for (const link of [...facts, ...inferred]) {
    for (const key of [link.from, link.to]) {
      if (byId.has(key)) nodeIds.add(key)
    }
  }
  return {
    centers,
    nodes: [...nodeIds].map((id) => byId.get(id)),
    facts,
    inferred,
    empty: false,
  }
}

async function resolveRunDir(payload = {}) {
  if (payload.dir) return String(payload.dir)
  const runs = (await readdir(RUNS_DIR, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  if (!runs.length) throw new Error('还没有导出过 run：先调用 ios_events_export')
  const runId = String(payload.runId || runs[runs.length - 1])
  return join(RUNS_DIR, runId)
}

export async function queryRun(payload = {}) {
  const dir = await resolveRunDir(payload)
  let events
  let links
  try {
    events = parseJsonl(await readFile(join(dir, 'events.jsonl'), 'utf8'))
    links = parseJsonl(await readFile(join(dir, 'links.jsonl'), 'utf8'))
  } catch {
    throw new Error(`读不到 run：${dir}（确认是 ios_events_export 产出的目录）`)
  }

  if (payload.id || payload.rpcId) {
    const result = selectNeighborhood(events, links, payload)
    return {
      ok: true,
      dir,
      ...result,
      hint: result.empty
        ? '没有匹配的事件。id 区分前缀（mem: / mark: / log:）；rpcId 要等网络对象进来才有。'
        : 'facts 是 method=id 的事实，inferred 是 method=time 的推断，报告里不要混用。',
    }
  }

  return {
    ok: true,
    dir,
    counts: summarizeEvents(events),
    links: { total: links.length, facts: links.filter((link) => link.method === 'id').length },
    sample: events.slice(-5),
    hint: '给 id（如 mem:12）或 rpcId 可以看它的一跳邻居。',
  }
}
