// core/report-run.js · 把一份 run 落成报告文件（CLI 与面板共用）
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseJsonl } from './query.js'
import { summarizeRun, deriveFindings, renderReport } from './report.js'

const ROOT = fileURLToPath(new URL('../', import.meta.url))

export async function generateReport({ dir, project = 'unknown', title, slug = 'run', device, time, outDir }) {
  const events = parseJsonl(await readFile(join(dir, 'events.jsonl'), 'utf8'))
  const links = parseJsonl(await readFile(join(dir, 'links.jsonl'), 'utf8'))
  if (!events.length) throw new Error('run 里没有事件')

  const runId = dir.replace(/\/+$/, '').split('/').pop()
  const summary = summarizeRun(events, links, runId)
  const findings = deriveFindings(summary, events, links)
  const markdown = renderReport({
    title: title || `采集 ${runId}`,
    project,
    runId,
    runDir: dir,
    summary,
    findings,
    device,
    time,
  })

  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
  const baseDir = outDir || join(ROOT, 'docs', 'measurements', project)
  const path = join(baseDir, `${stamp}-${slug}.md`)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, markdown)
  return { ok: true, path, runId, events: events.length, links: links.length }
}
