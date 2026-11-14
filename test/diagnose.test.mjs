import test from 'node:test'
import assert from 'node:assert/strict'
import { aggregateDiagnose, renderDiagnoseReport } from '../core/diagnose.js'

test('聚合：代码 bad 时总体 bad，内存没采样标跳过，体检缺失也要列出', () => {
  const result = aggregateDiagnose({
    check: { verdict: 'warn', items: [{ status: 'warn' }, { status: 'pass' }] },
    health: { oversize: [{ path: '/x/Big.swift', lines: 600 }], lint: { total: 3, byRule: [{ rule: 'function_body_length', count: 3, severity: 'Error' }] } },
    memory: { stats: null },
  })
  assert.equal(result.level, 'bad')
  assert.ok(result.subline.includes('跳过'))
  assert.equal(result.modules.length, 4)
  assert.ok(result.modules.some((module) => module.id === 'D'))
  assert.equal(result.modules[3].id, 'F')
  assert.ok(result.modules[3].headline.includes('没检测到'))
  const simOnly = aggregateDiagnose({ check: { verdict: 'pass', items: [] }, health: null, memory: null, includeDevice: false })
  assert.ok(simOnly.modules.find((module) => module.id === 'F').headline.includes('只跑模拟机'))
  assert.equal(simOnly.modules.find((module) => module.id === 'F').skipped, true)
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

test('诊断交接：体检需要注意的项要列出来', async () => {
  const { buildDiagnoseHandoff } = await import('../core/diagnose.js')
  const result = aggregateDiagnose({ check: { verdict: 'warn', items: [] }, health: null, memory: null })
  const text = buildDiagnoseHandoff({
    result, reportPath: '/x/d.md', project: 'demo',
    checks: { items: [
      { title: '构建类型', status: 'warn', detail: 'Debug 构建' },
      { title: '进程在跑', status: 'pass', detail: 'pid 1' },
    ] },
  })
  assert.ok(text.includes('构建类型（warn）：Debug 构建'))
  assert.ok(!text.includes('进程在跑（pass）'))
})

test('结论副标题：连上的真机写「已连接」，不再误写跳过', () => {
  const result = aggregateDiagnose({
    check: { verdict: 'warn', items: [] },
    health: null,
    memory: null,
    device: { name: 'iPhone' },
  })
  assert.ok(result.subline.includes('真机：已连接'))
  assert.ok(result.subline.includes('内存：跳过'))
})

test('总体措辞：只有代码坏时说「运行时正常」', () => {
  const result = aggregateDiagnose({
    check: { verdict: 'pass', items: [] },
    health: { oversize: [{ path: '/x/a', lines: 600 }], lint: { total: 5, byRule: [{ rule: 'function_body_length', count: 5, severity: 'Error' }] } },
    memory: { stats: { samples: 20, spanSec: 12, marks: 0 }, level: 'ok', headline: '平稳' },
  })
  assert.equal(result.level, 'bad')
  assert.ok(result.headline.includes('运行时正常'))
})

test('内存：没打点的短窗口写「静置基线」', () => {
  const result = aggregateDiagnose({
    check: { verdict: 'pass', items: [] },
    health: null,
    memory: { stats: { samples: 20, spanSec: 12, marks: 0 }, level: 'ok', headline: '静置平稳，没有泄漏迹象' },
  })
  const moduleA = result.modules.find((module) => module.id === 'A')
  assert.ok(moduleA.headline.includes('静置基线'))
})
