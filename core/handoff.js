// core/handoff.js · 把报告转成「可粘贴给另一个 Agent」的消息
//
// 为什么：报告在插件仓库，被测项目的会话没有上下文。粘一段带绝对路径的消息过去，
// 对方 Agent 能自己打开文件排查，不用人肉转述数字。
// 纯函数：输入报告 Markdown + 路径，输出字符串。

import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

/// 同一项目最近一次的代码健康报告；没扫过就返回 null。
export async function findHealthReport(project, root) {
  try {
    const dir = join(root, 'docs', 'measurements', project)
    const files = (await readdir(dir)).filter((name) => name.endsWith('-health.md')).sort()
    return files.length ? join(dir, files[files.length - 1]) : null
  } catch {
    return null
  }
}

export function buildHandoff(text, { reportPath, root, toolName = 'dsh-ios-diag', healthPath = null }) {
  const lines = String(text || '').split('\n')
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

  function blockLines(name) {
    const start = lines.findIndex((line) => line.trim() === `## ${name}`)
    if (start < 0) return []
    const out = []
    for (let i = start + 1; i < lines.length; i++) {
      if (lines[i].startsWith('## ')) break
      if (lines[i].trim()) out.push(lines[i].trim())
    }
    return out
  }

  const verdictBlock = blockLines('结论')
  const verdictHeadline = verdictBlock.find((line) => line.startsWith('**')) || ''
  const verdictItems = verdictBlock
    .filter((line) => /^([-*]|\d+\.)\s/.test(line))
    .map((line) => line.replace(/^([-*]|\d+\.)\s+/, '').trim())

  const summary = section('摘要')
  const advice = section('给被测项目的排查建议')
  const project = meta['项目'] || '被测项目'
  const when = meta['时间'] || ''
  const device = meta['设备'] || ''

  const out = []
  out.push(`【实测报告】${title}`)
  out.push('')
  out.push(`背景：${when ? when + '，' : ''}用 ${toolName} 测了一轮。`)
  if (device) out.push(`设备：${device}`)
  out.push(`只读采样，没有改 ${project} 仓库的任何文件。`)
  out.push('')
  if (verdictHeadline) {
    out.push(`结论：${verdictHeadline.replace(/\*/g, '').trim()}`)
    for (const item of verdictItems) out.push(`- ${item}`)
    out.push('')
  } else if (summary.length) {
    out.push('关键结论：')
    for (const item of summary) out.push(`- ${item}`)
    out.push('')
  }
    out.push('完整报告（绝对路径，直接读这个文件）：')
  out.push(reportPath)
  out.push('')
  if (healthPath) {
    out.push('代码健康报告（另一份，同样直接读）：')
    out.push(healthPath)
    out.push('')
  }
  if (advice.length) {
    out.push('建议排查：')
    advice.forEach((item, index) => out.push(`${index + 1}. ${item}`))
    out.push('')
  }
  out.push('报告里有数据表、异常疑点和复现命令；需要原始采样参数我再补。')
  out.push('')
  out.push('--- 需要进一步测试时怎么用我 ---')
  out.push('')
  out.push(`我这套工具（${toolName}）就是干 iOS 诊断的（内存/日志/真机录制/类型下钻），别自己写脚本或加埋点。入口：`)
  out.push('1) 模拟器实时：ios_mem_targets → ios_mem_start → 做操作 → ios_mem_status / ios_mem_detail → ios_mem_stop')
  out.push('2) 真机总量：ios_mem_record { bundleId, seconds: 10 }')
  out.push('3) 真机按类型：ios_mem_types { bundleId, seconds: 10, limit: 20 }')
  out.push('4) 真机日志：ios_device_log { bundleId, seconds: 8, grep: "关键字" }')
  out.push('')
  out.push('什么时候值得叫我：改完列表/图片/Markdown 渲染要复测；线上报 OOM 或被系统杀；用户说「越来越卡」。')
  out.push('测之前先定两件事：场景（含 DSH_STRESS 之类的开关）和对比口径。')
  out.push('')
  out.push('如果这个会话里看不到这些工具，就把「场景 + 改动 + 想对比的基线」写清楚，让用户转给我。')
  out.push('')
  if (root) out.push(`工具仓库：${root}`)
  out.push('我这边只读你们的工程，报告也只写在我自己的仓库里。')
  return out.join('\n') + '\n'
}


/// 解析体检 report.md（表格形式），转成结构化条目。
export function parseCheckReport(markdown) {
  const lines = String(markdown || '').split('\n')
  const title = (lines.find((line) => line.startsWith('# ')) || '# 体检').slice(2).trim()
  const app = (lines.find((line) => line.startsWith('- App：')) || '').replace('- App：', '').trim()
  const verdictMatch = lines.find((line) => line.startsWith('- 结论：')) || ''
  const verdict = (verdictMatch.match(/\*\*(.+?)\*\*/) || [])[1] || 'unknown'
  const items = []
  for (const line of lines) {
    if (!line.startsWith('|')) continue
    const cells = line.split('|').map((cell) => cell.trim()).filter(Boolean)
    if (cells.length < 4) continue
    if (cells[0] === '项' || /^[-: ]+$/.test(cells[0])) continue
    items.push({ name: cells[0], status: cells[1], value: cells[2], why: cells[3] })
  }
  return { title, app, verdict, items }
}

export function buildCheckHandoff({ title, app, verdict, items = [], reportPath, root, toolName = 'dsh-ios-diag' }) {
  const label = { pass: '通过', warn: '注意', fail: '不通过', unknown: '未知' }
  const attention = items.filter((item) => item.status !== 'pass')
  const out = []
  out.push(`【装真机前体检】${app || title}`)
  out.push('')
  out.push(`结论：${label[verdict] || verdict}${attention.length ? `（${attention.length} 项需要看）` : '（全部通过）'}`)
  out.push('')
  if (attention.length) {
    out.push('需要注意：')
    for (const item of attention) out.push(`- ${item.name}（${label[item.status] || item.status}）：${item.value}`)
    out.push('')
  }
  out.push('完整报告（绝对路径，直接读这个文件）：')
  out.push(reportPath)
  out.push('')
  out.push('--- 怎么复查 ---')
  out.push('')
  out.push(`用 ${toolName} 重跑：ios_preflight { bundleId: "<App 的 bundle id>" }`)
  out.push('装真机前要修的两类：构建类型是 Debug（数字不代表真机）、日志窗口内有 error。')
  out.push('')
  if (root) out.push(`工具仓库：${root}`)
  out.push('这份体检只读模拟器与工作区，没有改你们的仓库。')
  return out.join('\n') + '\n'
}
