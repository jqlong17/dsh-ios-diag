// core/health.js · 代码健康扫描的纯逻辑
//
// 只做三件事：数行数、找超限文件、聚合 SwiftLint 结果。扫描与渲染分开，
// 前者可以对着任何仓库跑（只读），后者只输出 Markdown。
//
// 阈值来自《代码编写执行规范》原则三：单文件 400 行、单类型约 150 行。

const SEVERITY_ORDER = { Error: 2, Warning: 1, Note: 0 }

export function countLines(text) {
  if (!text) return 0
  const lines = String(text).split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  return lines.length
}

export function findOversize(files, limit = 400) {
  return files
    .filter((file) => file.lines > limit)
    .sort((a, b) => b.lines - a.lines)
}

/// SwiftLint 的 JSON 是一行一个违规对象；按 rule_id 聚合，取最高严重级别。
export function aggregateLint(json, limit = 20) {
  let rows
  try {
    rows = JSON.parse(String(json || '[]'))
  } catch {
    return { total: 0, byRule: [], samples: [] }
  }
  if (!Array.isArray(rows)) return { total: 0, byRule: [], samples: [] }

  const byRule = new Map()
  for (const row of rows) {
    if (!row || !row.rule_id) continue
    const entry = byRule.get(row.rule_id) || { rule: row.rule_id, count: 0, severity: 'Note' }
    entry.count += 1
    if ((SEVERITY_ORDER[row.severity] || 0) > (SEVERITY_ORDER[entry.severity] || 0)) {
      entry.severity = row.severity
    }
    byRule.set(row.rule_id, entry)
  }

  const sorted = [...byRule.values()].sort((a, b) => b.count - a.count)
  return {
    total: rows.length,
    byRule: sorted.slice(0, limit),
    samples: rows.slice(0, 5).map((row) => ({
      rule: row.rule_id,
      file: row.file,
      line: row.line,
      reason: row.reason,
    })),
  }
}

export function renderHealthReport({ project, target, files, oversize, lint, generatedAt }) {
  const totalLines = files.reduce((sum, file) => sum + file.lines, 0)
  const lines = []
  lines.push(`# 代码健康扫描 · ${project}`)
  lines.push('')
  lines.push(`> **项目**：${project}`)
  lines.push(`> **目标目录**：${target}`)
  lines.push(`> **时间**：${generatedAt}`)
  lines.push('> **工具**：dsh-ios-mem health-scan（只读；不修改目标仓库）')
  lines.push('')
  lines.push('## 概览')
  lines.push('')
  lines.push('| 指标 | 值 |')
  lines.push('| --- | --- |')
  lines.push(`| 扫描文件 | ${files.length} |`)
  lines.push(`| 总行数 | ${totalLines} |`)
  lines.push(`| 超过 400 行 | ${oversize.length} |`)
  lines.push(`| Lint 违规 | ${lint.total} |`)
  lines.push('')
  lines.push('## 超限文件（> 400 行）')
  lines.push('')
  if (!oversize.length) {
    lines.push('没有超过 400 行的文件。')
  } else {
    lines.push('| 文件 | 行数 |')
    lines.push('| --- | --- |')
    for (const file of oversize.slice(0, 20)) lines.push(`| ${file.path} | ${file.lines} |`)
  }
  lines.push('')
  lines.push('## Lint 规则（按违规数）')
  lines.push('')
  if (!lint.byRule.length) {
    lines.push('没有 lint 违规（或没装 SwiftLint）。')
  } else {
    lines.push('| 规则 | 违规数 | 最高级别 |')
    lines.push('| --- | --- | --- |')
    for (const entry of lint.byRule) lines.push(`| ${entry.rule} | ${entry.count} | ${entry.severity} |`)
  }
  lines.push('')
  lines.push('## 结论')
  lines.push('')
  if (oversize.length || lint.byRule.some((entry) => entry.severity === 'Error')) {
    lines.push('- 有超限文件或 Error 级 lint：先拆文件，再看规则明细。')
  } else {
    lines.push('- 结构阈值内；lint 没有 Error。')
  }
  lines.push('- 阈值是规范值（400 行/文件、150 行/类型），可按项目调整。')
  return lines.join('\n')
}
