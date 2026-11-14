import test from 'node:test'
import assert from 'node:assert/strict'
import { buildHandoff } from '../core/handoff.js'

const report = `# 示例

> **项目**：demo
> **时间**：2026-11-14 10:00
> **设备**：模拟器

## 摘要

- 内存 100 → 180 MB（+80%）。

## 给被测项目的排查建议

1. 先看错误日志。

## 复现方式

\`\`\`bash
x
\`\`\`
`

test('buildHandoff：带标题、绝对路径、摘要与建议', () => {
  const text = buildHandoff(report, { reportPath: '/tmp/r.md', root: '/tmp/repo' })
  assert.ok(text.includes('【实测报告】示例'))
  assert.ok(text.includes('/tmp/r.md'))
  assert.ok(text.includes('+80%'))
  assert.ok(text.includes('先看错误日志'))
  assert.ok(text.includes('/tmp/repo'))
})

test('buildHandoff：空报告也不炸', () => {
  const text = buildHandoff('', { reportPath: '/x.md' })
  assert.ok(text.includes('/x.md'))
})

test('buildHandoff：有健康报告时一起给出路径', () => {
  const text = buildHandoff(report, { reportPath: '/tmp/r.md', healthPath: '/tmp/h.md' })
  assert.ok(text.includes('代码健康报告'))
  assert.ok(text.includes('/tmp/h.md'))
})

test('buildHandoff：没有健康报告就不硬塞', () => {
  const text = buildHandoff(report, { reportPath: '/tmp/r.md' })
  assert.equal(text.includes('代码健康报告'), false)
})
