import test from 'node:test'
import assert from 'node:assert/strict'
import { aggregateDiagnose, renderDiagnoseReport } from '../core/diagnose.js'

test('聚合：代码 bad 时总体 bad，内存没采样标跳过', () => {
  const result = aggregateDiagnose({
    check: { verdict: 'warn', items: [{ status: 'warn' }, { status: 'pass' }] },
    health: { oversize: [{ path: '/x/Big.swift', lines: 600 }], lint: { total: 3, byRule: [{ rule: 'function_body_length', count: 3, severity: 'Error' }] } },
    memory: { stats: null },
  })
  assert.equal(result.level, 'bad')
  assert.ok(result.subline.includes('跳过'))
  assert.equal(result.modules.length, 4)
  assert.equal(result.modules[3].id, 'F')
  assert.ok(result.modules[3].headline.includes('没检测到'))
  const simOnly = aggregateDiagnose({ check: { verdict: 'pass', items: [] }, health: null, memory: null, includeDevice: false })
  assert.ok(simOnly.modules.find((module) => module.id === 'F').headline.includes('只跑模拟机'))
})

test('聚合：全绿时总体 ok', () => {
  const result = aggregateDiagnose({
    check: { verdict: 'pass', items: [{ status: 'pass' }] },
    health: { oversize: [], lint: { total: 0, byRule: [] } },
    memory: { stats: { samples: 20, spanSec: 30 }, level: 'ok', headline: '平稳' },
  })
  assert.equal(result.level, 'ok')
})

test('报告：带结论、模块与报告文件', () => {
  const result = aggregateDiagnose({ check: { verdict: 'warn', items: [] }, health: null, memory: null })
  const md = renderDiagnoseReport({ project: 'demo', when: '2026-11-14 19:00', device: '模拟器', result, reportPaths: { 体检: '/x/pre/report.md' } })
  assert.ok(md.includes('## 结论'))
  assert.ok(md.includes('demo'))
  assert.ok(md.includes('/x/pre/report.md'))
})
