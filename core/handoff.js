// core/handoff.js · 把报告转成「可粘贴给另一个 Agent」的消息
//
// 为什么：报告在插件仓库，被测项目的会话没有上下文。粘一段带绝对路径的消息过去，
// 对方 Agent 能自己打开文件排查，不用人肉转述数字。
// 纯函数：输入报告 Markdown + 路径，输出字符串。

export function buildHandoff(text, { reportPath, root, toolName = 'dsh-ios-diag' }) {
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
