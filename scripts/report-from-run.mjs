// 把一份导出的 run 变成正式报告（docs/measurements/<项目>/<时间>-<主题>.md）。
//
//   node scripts/report-from-run.mjs --run 20261114-1603 --project dsh-pocket-ios \
//     --title "DSH Pocket 内存采样" --slug memory-run
//
// 生成后可直接用 `npm run handoff -- --report <路径>` 出交接消息。
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseJsonl } from '../core/query.js'
import { summarizeRun, deriveFindings, renderReport } from '../core/report.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const runsDir = join(root, 'docs', 'measurements', '_runs')

const args = process.argv.slice(2)
function option(name) {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

const runArg = option('--run')
const project = option('--project') || 'unknown'
const title = option('--title') || `内存采样 run ${runArg || ''}`.trim()
const slug = option('--slug') || 'run'
const device = option('--device')
const outArg = option('--out')

if (!runArg) {
  console.error('用法: node scripts/report-from-run.mjs --run <runId|目录> --project <slug> --title <标题> [--slug <文件名>]')
  process.exit(2)
}

const runDir = isAbsolute(runArg) ? runArg : join(runsDir, runArg)
let events
let links
try {
  events = parseJsonl(await readFile(join(runDir, 'events.jsonl'), 'utf8'))
  links = parseJsonl(await readFile(join(runDir, 'links.jsonl'), 'utf8'))
} catch {
  console.error(`读不到 run：${runDir}`)
  process.exit(1)
}
if (!events.length) {
  console.error('run 里没有事件')
  process.exit(1)
}

const runId = runDir.split('/').pop()
const summary = summarizeRun(events, links, runId)
const findings = deriveFindings(summary, events, links)
const markdown = renderReport({ title, project, runId, runDir, summary, findings, device })

const now = new Date()
const pad = (value) => String(value).padStart(2, '0')
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
const out = outArg
  ? resolve(outArg)
  : join(root, 'docs', 'measurements', project, `${stamp}-${slug}.md`)

await mkdir(dirname(out), { recursive: true })
await writeFile(out, markdown)
console.log(out)
