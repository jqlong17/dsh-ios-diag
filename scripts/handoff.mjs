// 把一份实测记录转成「可粘贴给被测项目」的消息。
//
// 为什么要有它：报告在插件仓库，被测项目的会话拿不到上下文；粘一段带绝对路径的
// 消息过去，对方 Agent 能自己打开文件排查，不用人肉转述数字。
//
//   node scripts/handoff.mjs --report docs/measurements/<project>/<file>.md
import { readFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const args = process.argv.slice(2)
function option(name) {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

const reportArg = option('--report')
if (!reportArg) {
  console.error('用法: node scripts/handoff.mjs --report docs/measurements/<project>/<file>.md')
  process.exit(2)
}

const reportPath = isAbsolute(reportArg) ? reportArg : resolve(root, reportArg)
let text
try {
  text = await readFile(reportPath, 'utf8')
} catch {
  console.error(`读不到报告：${reportPath}`)
  process.exit(1)
}

const lines = text.split('\n')
const title = (lines.find((line) => line.startsWith('# ')) || '# 实测报告').slice(2).trim()
const meta = {}
for (const line of lines) {
  const match = line.match(/^> \*\*(.+?)\*\*：(.+)$/)
  if (match) meta[match[1]] = match[2].trim()
}

function section(name) {
  const start = lines.findIndex((line) => line.trim() === `## ${name}`)
  if (start < 0) return []
  const out = []
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('## ')) break
    const item = line.match(/^\s*(?:[-*]|\d+\.)\s+(.+)$/)
    if (item) out.push(item[1].trim())
  }
  return out
}

const summary = section('摘要')
const advice = section('给被测项目的排查建议')

const project = meta['项目'] || '被测项目'
const when = meta['时间'] || ''
const device = meta['设备'] || ''

const out = []
out.push(`【内存实测报告】${title}`)
out.push('')
out.push(`背景：${when ? when + '，' : ''}用 dsh-ios-mem 测了一轮。`)
if (device) out.push(`设备：${device}`)
out.push(`只读采样，没有改 ${project} 仓库的任何文件。`)
out.push('')
if (summary.length) {
  out.push('关键结论：')
  for (const item of summary) out.push(`- ${item}`)
  out.push('')
}
out.push('完整报告（绝对路径，直接读这个文件）：')
out.push(reportPath)
out.push('')
if (advice.length) {
  out.push('建议排查：')
  advice.forEach((item, index) => out.push(`${index + 1}. ${item}`))
  out.push('')
}
out.push('报告里有数据表、异常疑点和复现命令；需要原始采样参数我再补。')

process.stdout.write(out.join('\n') + '\n')
