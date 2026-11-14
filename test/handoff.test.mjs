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

test('buildHandoff：有结论段时以结论开头', () => {
  const withVerdict = `${report}
## 结论

**一次性上涨，之后平稳**　\`[A.2.2]\`

- 窗口内从 61.3 涨到 101.6MB，但最近 15 秒已经平了。
`
  const text = buildHandoff(withVerdict, { reportPath: '/tmp/r.md' })
  assert.ok(text.includes('结论：一次性上涨，之后平稳 [A.2.2]') || text.includes('结论：一次性上涨，之后平稳'))
  assert.ok(!text.includes('关键结论：'))
})

const checkMd = `# 装真机前体检 · preflight-1

- App：DSH Pocket 1.0.8 (12)
- 结论：**warn**

| 项 | 状态 | 数值 | 依据 |
| --- | --- | --- | --- |
| 进程在跑 | pass | pid 1 | 能找到 |
| 构建类型 | warn | Debug 构建 | 有 debug.dylib |
`

test('parseCheckReport：解析结论与条目', async () => {
  const { parseCheckReport } = await import('../core/handoff.js')
  const parsed = parseCheckReport(checkMd)
  assert.equal(parsed.verdict, 'warn')
  assert.equal(parsed.app, 'DSH Pocket 1.0.8 (12)')
  assert.equal(parsed.items.length, 2)
  assert.equal(parsed.items[1].name, '构建类型')
})

test('buildCheckHandoff：带路径、需要注意项与复查命令', async () => {
  const { buildCheckHandoff } = await import('../core/handoff.js')
  const text = buildCheckHandoff({
    app: 'DSH Pocket 1.0.8 (12)', verdict: 'warn', reportPath: '/tmp/pre/report.md', root: '/tmp/repo',
    items: [{ name: '构建类型', status: 'warn', value: 'Debug 构建' }, { name: '进程在跑', status: 'pass', value: 'pid 1' }],
  })
  assert.ok(text.includes('【装真机前体检】DSH Pocket'))
  assert.ok(text.includes('/tmp/pre/report.md'))
  assert.ok(text.includes('构建类型'))
  assert.ok(text.includes('ios_preflight'))
})
