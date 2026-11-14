// core/runs.js · 历史 run 列表（面板的「记录」区）
//
// 目录就是数据库：_runs/<runId>/ 下有无 events/links/report，决定这一行显示什么。
// 只读，不清理、不改名。
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const RUNS_DIR = fileURLToPath(new URL('../docs/measurements/_runs/', import.meta.url))

async function readJsonl(path) {
  try {
    const text = await readFile(path, 'utf8')
    return text.split('\n').filter((line) => line.trim()).map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return null
      }
    }).filter(Boolean)
  } catch {
    return []
  }
}

export async function listRuns({ base = RUNS_DIR, limit = 20 } = {}) {
  let entries
  try {
    entries = await readdir(base, { withFileTypes: true })
  } catch {
    return []
  }
  const names = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse()
    .slice(0, limit)

  const runs = []
  for (const runId of names) {
    const dir = join(base, runId)
    const events = await readJsonl(join(dir, 'events.jsonl'))
    const links = await readJsonl(join(dir, 'links.jsonl'))
    let hasReport = false
    try {
      await stat(join(dir, 'report.md'))
      hasReport = true
    } catch {
      // 没有报告也正常：刚导出的 run 还没生成
    }
    let mode = 'live'
    try {
      mode = JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8')).mode || 'live'
    } catch {
      // 老 run 没有 meta
    }
    runs.push({
      runId,
      dir,
      events: events.length,
      links: links.length,
      from: events.length ? events[0].ts : null,
      to: events.length ? events[events.length - 1].ts : null,
      hasReport,
      mode,
    })
  }
  return runs
}
