import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizeRun, deriveFindings, renderReport } from '../core/report.js'

const events = [
  { ts: '2026-11-14T07:39:30.000Z', type: 'mark', id: 'mark:1', attrs: { label: 'enter' } },
  { ts: '2026-11-14T07:39:35.000Z', type: 'mem_sample', id: 'mem:1', attrs: { totalMB: 100 } },
  { ts: '2026-11-14T07:39:45.000Z', type: 'mem_sample', id: 'mem:2', attrs: { totalMB: 150 } },
  { ts: '2026-11-14T07:39:46.000Z', type: 'log', id: 'log:1', attrs: { message: 'request timeout' } },
]

test('summarizeRun：计数、内存区间、增长百分比', () => {
  const summary = summarizeRun(events, [], '1')
  assert.equal(summary.counts.mem_sample, 2)
  assert.equal(summary.memory.firstMB, 100)
  assert.equal(summary.memory.lastMB, 150)
  assert.equal(summary.memory.deltaMB, 50)
  assert.equal(summary.memory.deltaPercent, 50)
  assert.equal(summary.marks.length, 1)
})

test('deriveFindings：增长超 10% 与错误日志各给一条', () => {
  const summary = summarizeRun(events, [], '1')
  const findings = deriveFindings(summary, events, [])
  assert.ok(findings.some((text) => text.includes('+50%')))
  assert.ok(findings.some((text) => text.includes('timeout')))
})

test('deriveFindings：没有样本时明确说没有', () => {
  const summary = summarizeRun([], [], '1')
  const findings = deriveFindings(summary, [], [])
  assert.ok(findings.some((text) => text.includes('没有内存样本')))
})

test('renderReport：六段齐全，且带项目与 run 路径', () => {
  const summary = summarizeRun(events, [], '1')
  const md = renderReport({
    title: '测试报告', project: 'demo', runId: '1', runDir: '/tmp/run-1',
    summary, findings: deriveFindings(summary, events, []),
  })
  for (const heading of ['## 摘要', '## 数据', '## 异常与疑点', '## 给被测项目的排查建议', '## 复现方式']) {
    assert.ok(md.includes(heading), heading)
  }
  assert.ok(md.includes('> **项目**：demo'))
  assert.ok(md.includes('/tmp/run-1'))
})
