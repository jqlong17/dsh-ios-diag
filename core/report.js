// core/report.js · 把一份 run 变成人看的报告
//
// 纯函数：summarizeRun / deriveFindings / renderReport。脚本只负责读写文件。
// 为什么自动生成「疑点」：报告最容易缺的不是数字，是「这些数字说明什么」。
// 规则是保守的（只标明显异常），宁可漏也不编。

export function summarizeRun(events, links, runId) {
  const sorted = [...events].sort((a, b) => String(a.ts).localeCompare(String(b.ts)))
  const counts = {}
  for (const event of sorted) counts[event.type] = (counts[event.type] || 0) + 1

  const totals = sorted
    .filter((event) => event.type === 'mem_sample' && Number.isFinite(event.attrs && event.attrs.totalMB))
    .map((event) => event.attrs.totalMB)
  // 真机录制的头几个样本是启动爬坡（0.1 MB → 30 MB），算百分比会得到 +65000%。
  const ramp = totals.length > 1 && totals[0] < 10 && totals[totals.length - 1] > 20
  const memory = totals.length
    ? {
      firstMB: totals[0],
      lastMB: totals[totals.length - 1],
      minMB: Math.min(...totals),
      maxMB: Math.max(...totals),
      deltaMB: Math.round((totals[totals.length - 1] - totals[0]) * 10) / 10,
      deltaPercent: ramp ? null : (totals[0] ? Math.round((totals[totals.length - 1] - totals[0]) / totals[0] * 1000) / 10 : 0),
      ramp,
    }
    : null

  const marks = sorted
    .filter((event) => event.type === 'mark')
    .map((event) => ({ ts: event.ts, label: (event.attrs && event.attrs.label) || '' }))
  const logErrors = sorted.filter((event) => event.type === 'log'
    && /error|fail|timeout|refused/i.test((event.attrs && event.attrs.message) || ''))

  return {
    runId,
    counts,
    memory,
    marks,
    logErrors: logErrors.length,
    logErrorSamples: logErrors.slice(0, 3).map((event) => event.attrs.message),
    links: {
      facts: links.filter((link) => link.method === 'id').length,
      inferred: links.filter((link) => link.method !== 'id').length,
    },
    span: sorted.length ? { from: sorted[0].ts, to: sorted[sorted.length - 1].ts } : null,
  }
}

export function deriveFindings(summary, events, links) {
  const findings = []
  if (!summary.memory) {
    findings.push('这份 run 没有内存样本：要么没采样，要么导出时目标已退出。')
  } else if (summary.memory.ramp) {
    findings.push(`首个样本只有 ${summary.memory.firstMB} MB（启动爬坡），增长百分比不具参考意义；看峰值 ${summary.memory.maxMB} MB / 末值 ${summary.memory.lastMB} MB。`)
  } else if (summary.memory.deltaPercent >= 10) {
    findings.push(`内存从 ${summary.memory.firstMB} MB 涨到 ${summary.memory.lastMB} MB（+${summary.memory.deltaPercent}%）。`)
  }
  if (summary.memory && summary.memory.maxMB - summary.memory.minMB >= 50) {
    findings.push(`峰值 ${summary.memory.maxMB} MB 与谷值 ${summary.memory.minMB} MB 相差 ${Math.round((summary.memory.maxMB - summary.memory.minMB) * 10) / 10} MB。`)
  }
  if (summary.logErrors > 0) {
    findings.push(`日志里有 ${summary.logErrors} 条错误/超时，例如「${summary.logErrorSamples[0]}」。`)
  }
  if (summary.marks.length) {
    findings.push(`打了 ${summary.marks.length} 个点：${summary.marks.map((mark) => mark.label).join('、')}。`)
  }
  if (summary.links.inferred > 0) {
    findings.push(`有 ${summary.links.inferred} 条时间推断链接（置信度 0.5），它们只是「时间挨着」，不能当因果。`)
  }
  if (!findings.length) findings.push('这份 run 没有明显异常；先看数据表确认采样窗口够不够。')
  return findings
}

function table(summary) {
  const rows = [
    ['事件总数', Object.values(summary.counts).reduce((sum, value) => sum + value, 0)],
    ['内存样本', summary.counts.mem_sample || 0],
    ['打点', summary.counts.mark || 0],
    ['日志', summary.counts.log || 0],
    ['日志错误', summary.logErrors],
    ['链接（事实/推断）', `${summary.links.facts} / ${summary.links.inferred}`],
  ]
  if (summary.memory) {
    rows.push(['内存 起点 / 终点', `${summary.memory.firstMB} / ${summary.memory.lastMB} MB`])
    rows.push(['内存 峰值 / 谷值', `${summary.memory.maxMB} / ${summary.memory.minMB} MB`])
    rows.push(['内存 变化', `${summary.memory.deltaMB >= 0 ? '+' : ''}${summary.memory.deltaMB} MB${summary.memory.ramp ? '（启动爬坡，%不适用）' : `（${summary.memory.deltaPercent}%）`}`])
  }
  return ['| 指标 | 值 |', '| --- | --- |', ...rows.map(([key, value]) => `| ${key} | ${value} |`)].join('\n')
}

export function renderReport({ title, project, runId, runDir, summary, findings, assessment, device, time }) {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  // 用本地时间：报告是给人看的，ISO/UTC 会让人以为是另一天。
  const when = time || `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
  const advice = []
  if (summary.memory && !summary.memory.ramp && summary.memory.deltaPercent >= 10) {
    advice.push('对照打点位置，确认内存上涨发生在哪个操作之后；再调 `ios_mem_detail` 看当时是谁占的。')
  }
  if (summary.logErrors > 0) {
    advice.push('先看错误日志的上下文（`ios_log_query` 的 grep），确认是超时、重试还是被拒。')
  }
  advice.push(`原始数据在 \`${runDir}\`（events.jsonl / links.jsonl），可用 \`ios_events_query\` 按 id 查一跳。`)
  advice.push('本报告由 dsh-ios-diag 生成；被测项目未做任何修改。')

  return [
    `# ${title}`,
    '',
    `> **项目**：${project}`,
    `> **时间**：${when}`,
    `> **设备**：${device || '模拟器'}`,
    `> **采集**：dsh-ios-diag run ${runId}`,
    `> **原始数据**：${runDir}`,
    '',
    ...(assessment ? [
      '## 结论',
      '',
      `**${assessment.headline}**`,
      '',
      ...(assessment.reasons || []).map((text) => `- ${text}`),
      '',
      ...(assessment.next && assessment.next.length
        ? ['下一步：', '', ...assessment.next.map((text, index) => `${index + 1}. ${text}`), '']
        : []),
    ] : []),

    '## 摘要',
    '',
    `- 事件 ${Object.values(summary.counts).reduce((sum, value) => sum + value, 0)} 条；内存样本 ${summary.counts.mem_sample || 0} 个，打点 ${summary.counts.mark || 0} 个。`,
    summary.memory
      ? (summary.memory.ramp
        ? `- 内存 ${summary.memory.firstMB} → ${summary.memory.lastMB} MB（含启动爬坡；峰值 ${summary.memory.maxMB} MB）。`
        : `- 内存 ${summary.memory.firstMB} → ${summary.memory.lastMB} MB（${summary.memory.deltaPercent >= 0 ? '+' : ''}${summary.memory.deltaPercent}%）。`)
      : '- 没有内存样本。',
    '',
    '## 数据',
    '',
    table(summary),
    '',
    '## 异常与疑点',
    '',
    ...findings.map((finding) => `- ${finding}`),
    '',
    '## 给被测项目的排查建议',
    '',
    ...advice.map((item, index) => `${index + 1}. ${item}`),
    '',
    '## 复现方式',
    '',
    '```bash',
    '# 重新导出（采样中的会话）',
    'ios_events_export { lastSeconds: 120 }',
    '# 查这份 run',
    `ios_events_query { dir: "${runDir}" }`,
    '```',
    '',
  ].join('\n')
}
