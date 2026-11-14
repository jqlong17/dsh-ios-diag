// core/diagnose.js · 一键诊断：把体检、代码健康、内存合成一次流程
//
// 产品上只有一个动作：跑一遍，给一份总报告。用户不该知道要先点哪个模块。
// 内存需要场景，没采样就明确写「本次跳过」，而不是假装通过。
import { assessMemory } from './assess.js'
import { assessHealth } from './health.js'

const LEVEL_RANK = { ok: 0, watch: 1, bad: 2 }
const LEVEL_LABEL = { ok: '正常', watch: '留意', bad: '需要处理' }

export function aggregateDiagnose({ check, health, memory, device = null, includeDevice = true, markCount = 0 }) {
  const modules = []

  if (check) {
    const level = check.verdict === 'fail' ? 'bad' : check.verdict === 'warn' ? 'watch' : 'ok'
    modules.push({
      id: 'D',
      name: '装真机前体检',
      level,
      skipped: false,
      headline: `体检 ${check.verdict}${check.items ? `（${check.items.filter((item) => item.status !== 'pass').length} 项需注意）` : ''}`,
      ruleId: null,
    })
  } else {
    // 没跑成就明说原因，而不是把这一项从报告里删掉。
    modules.push({
      id: 'D',
      name: '装真机前体检',
      level: null,
      skipped: true,
      headline: '未跑：没有找到运行中的 App（先打开模拟器里的 App）',
      ruleId: null,
    })
  }

  if (health) {
    const assessment = assessHealth(health)
    modules.push({ id: 'G', name: '代码健康', level: assessment.level, skipped: false, headline: assessment.headline, ruleId: assessment.ruleId, reasons: assessment.reasons })
  }

  if (memory && memory.stats) {
    modules.push({ id: 'A', name: '内存', level: memory.level, skipped: false, headline: memory.headline, ruleId: memory.ruleId, reasons: memory.reasons })
  } else {
    modules.push({ id: 'A', name: '内存', level: null, skipped: true, headline: '本次没采样（内存要配合场景才有意义）', ruleId: null })
  }

  modules.push({
    id: 'F',
    name: '真机',
    level: null,
    skipped: !includeDevice || !device,
    headline: !includeDevice
      ? '未勾选真机（这次只跑模拟机）'
      : device
        ? `已连接 ${device.name}（真机录制可在「记录」里单独跑）`
        : '勾选了真机，但没检测到在线设备（插上后补跑）',
    ruleId: null,
  })

  const levels = modules.map((module) => module.level).filter(Boolean)
  const worst = levels.includes('bad') ? 'bad' : levels.includes('watch') ? 'watch' : levels.length ? 'ok' : null

  return {
    level: worst,
    headline: worst === 'bad' ? '有需要处理的问题' : worst === 'watch' ? '能用，但有可改进项' : '这次没发现问题',
    subline: modules.map((module) => `${module.name}：${module.skipped ? '跳过' : (LEVEL_LABEL[module.level] || '已连接')}`).join(' · '),
    modules,
    markCount,
  }
}

export function renderDiagnoseReport({ project, when, device, result, reportPaths = {}, checks = null }) {
  const lines = []
  lines.push(`# 诊断报告 · ${project}`)
  lines.push('')
  lines.push(`> **项目**：${project}`)
  lines.push(`> **时间**：${when}`)
  lines.push(`> **设备**：${device}`)
  lines.push('> **只读**：没有修改被测仓库')
  lines.push('')
  lines.push('## 结论')
  lines.push('')
  lines.push(`**${result.headline}**`)
  lines.push('')
  lines.push(result.subline)
  lines.push('')
  for (const module of result.modules) {
    lines.push(`### ${module.id} ${module.name}`)
    lines.push('')
    lines.push(`${module.headline}${module.ruleId ? `　\`[${module.ruleId}]\`` : ''}`)
    for (const reason of module.reasons || []) lines.push(`- ${reason}`)
    lines.push('')
  }
  if (checks && checks.items) {
    lines.push('## 体检明细')
    lines.push('')
    lines.push('| 项 | 状态 | 数值 | 依据 |')
    lines.push('| --- | --- | --- | --- |')
    for (const item of checks.items) lines.push(`| ${item.title} | ${item.status} | ${item.detail} | ${item.how} |`)
    lines.push('')
  }
  lines.push('## 报告文件')
  lines.push('')
  for (const [name, path] of Object.entries(reportPaths)) {
    if (path) lines.push(`- ${name}：${path}`)
  }
  lines.push('')
  lines.push('## 复现方式')
  lines.push('')
  lines.push('```bash')
  lines.push('ios_preflight { bundleId: "<bundle id>" }')
  lines.push('npm run health -- --target <仓库路径> --project <slug>')
  lines.push('```')
  return lines.join('\n') + '\n'
}


/// 一键诊断的交接消息：一条消息带三个模块的结论与两个子报告路径。
export function buildDiagnoseHandoff({ result, reportPath, project, checks = null, healthPath = null, root, toolName = 'dsh-ios-diag' }) {
  const lines = []
  lines.push(`【诊断报告】${project}`)
  lines.push('')
  lines.push(`总体：${result.headline}`)
  lines.push('')
  for (const module of result.modules) {
    const tag = module.skipped ? `[${module.id}·跳过]` : `[${module.id}]`
    lines.push(`- ${tag} ${module.name}：${module.headline}${module.ruleId ? `（${module.ruleId}）` : ''}`)
  }
  if (checks && checks.items) {
    const attention = checks.items.filter((item) => item.status !== 'pass')
    if (attention.length) {
      lines.push('体检需要注意：')
      for (const item of attention) lines.push(`- ${item.title}（${item.status}）：${item.detail}`)
      lines.push('')
    }
  }
  lines.push('')
  lines.push('完整诊断报告（绝对路径，直接读这个文件）：')
  lines.push(reportPath)
  if (healthPath) {
    lines.push('')
    lines.push('代码健康报告：')
    lines.push(healthPath)
  }
  lines.push('')
  lines.push('--- 需要进一步测试时怎么用我 ---')
  lines.push('')
  lines.push(`用 ${toolName} 复查：ios_preflight { bundleId }、ios_mem_start/stop 采内存、npm run health 扫代码。`)
  lines.push('内存要配合场景：做一次具体操作再打点，才能判断是不是泄漏。')
  lines.push('')
  if (root) lines.push(`工具仓库：${root}`)
  lines.push('只读你们的工程；报告只写在我自己的仓库里。')
  return lines.join('\n') + '\n'
}
