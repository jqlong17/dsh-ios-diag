// core/report-run.js · 把一份 run 落成报告文件（CLI 与面板共用）
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseJsonl } from './query.js'
import { summarizeRun, deriveFindings, renderReport } from './report.js'
import { buildHandoff, findHealthReport } from './handoff.js'
import { assessMemory } from './assess.js'

const ROOT = fileURLToPath(new URL('../', import.meta.url))

export async function generateReport({ dir, project, title, slug = 'run', device, time, outDir, outFile }) {
  const events = parseJsonl(await readFile(join(dir, 'events.jsonl'), 'utf8'))
  const links = parseJsonl(await readFile(join(dir, 'links.jsonl'), 'utf8'))
  if (!events.length) throw new Error('run 里没有事件')

  const runId = dir.replace(/\/+$/, '').split('/').pop()
  let meta = {}
  try {
    meta = JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8'))
  } catch {
    // 老 run 没有 meta，按默认处理
  }
  // 面板有时拿不到 target（会话被重载/目标退出），project 会传成 unknown。
  // run 的 meta.json 里有 bundleId，够反推出项目名。
  if (!project || project === 'unknown') {
    project = (meta.bundleId && String(meta.bundleId).split('.').pop()) || meta.appName || 'unknown'
  }
  const deviceLabel = device || (meta.deviceName ? `${meta.deviceName}（${meta.mode === 'trace' ? '真机' : '模拟器'}）` : undefined)
  const summary = summarizeRun(events, links, runId)
  const findings = deriveFindings(summary, events, links)
  const samples = events
    .filter((event) => event.type === 'mem_sample' && Number.isFinite(event.attrs && event.attrs.totalMB))
    .map((event) => ({ t: Date.parse(event.ts) || 0, total: event.attrs.totalMB * 1048576 }))
  const marks = events.filter((event) => event.type === 'mark')
  const assessment = assessMemory({ samples, marks })
  const markdown = renderReport({
    title: title || `${meta.appName || '内存采样'} · ${runId}`,
    project,
    runId,
    runDir: dir,
    summary,
    findings,
    assessment,
    device: deviceLabel,
    time,
  })

  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
  const baseDir = outDir || join(ROOT, 'docs', 'measurements', project)
  // outFile 是精确路径（CLI 的 --out）；outDir 是目录（面板用）。
  const path = outFile || join(baseDir, `${stamp}-${slug}.md`)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, markdown)

  const healthPath = await findHealthReport(project, ROOT)

  return { ok: true, path, runId, events: events.length, links: links.length, handoff: buildHandoff(markdown, { reportPath: path, root: ROOT, healthPath }) }
}
