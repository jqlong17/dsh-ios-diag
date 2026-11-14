import test from 'node:test'
import assert from 'node:assert/strict'
import { countLines, findOversize, aggregateLint, renderHealthReport } from '../core/health.js'

test('countLines：按换行计数，空文件为 0', () => {
  assert.equal(countLines('a\nb\nc\n'), 3)
  assert.equal(countLines(''), 0)
  assert.equal(countLines('a\n'), 1)
})

test('findOversize：超过 400 行才进清单，并按行数降序', () => {
  const files = [
    { path: 'a.swift', lines: 120 },
    { path: 'big.swift', lines: 640 },
    { path: 'mid.swift', lines: 401 },
  ]
  const over = findOversize(files, 400)
  assert.deepEqual(over.map((file) => file.path), ['big.swift', 'mid.swift'])
})

test('aggregateLint：按规则聚合、降序、标最高严重级别', () => {
  const raw = JSON.stringify([
    { rule_id: 'file_length', severity: 'Warning', file: 'a.swift', line: 1, reason: 'too long' },
    { rule_id: 'file_length', severity: 'Warning', file: 'b.swift', line: 1, reason: 'too long' },
    { rule_id: 'force_unwrapping', severity: 'Error', file: 'c.swift', line: 9, reason: 'force unwrap' },
  ])
  const result = aggregateLint(raw)
  assert.equal(result.total, 3)
  assert.equal(result.byRule[0].rule, 'file_length')
  assert.equal(result.byRule[0].count, 2)
  assert.equal(result.byRule[0].severity, 'Warning')
  assert.equal(result.byRule[1].severity, 'Error')
})

test('aggregateLint：坏 JSON 返回空', () => {
  assert.equal(aggregateLint('not json').total, 0)
})

test('renderHealthReport：带目标、超限清单与规则表', () => {
  const md = renderHealthReport({
    project: 'demo',
    target: '/tmp/demo',
    files: [{ path: 'a.swift', lines: 120 }, { path: 'big.swift', lines: 640 }],
    oversize: [{ path: 'big.swift', lines: 640 }],
    lint: { total: 2, byRule: [{ rule: 'file_length', count: 2, severity: 'Warning' }], samples: [] },
    generatedAt: '2026-11-14 16:40',
  })
  assert.ok(md.includes('> **项目**：demo'))
  assert.ok(md.includes('/tmp/demo'))
  assert.ok(md.includes('big.swift'))
  assert.ok(md.includes('file_length'))
})

test('parseXccovCoverage：逐 target 覆盖率与平均', async () => {
  const { parseXccovCoverage } = await import('../core/health.js')
  const parsed = parseXccovCoverage(JSON.stringify({ targets: [
    { name: 'DSHKit', lineCoverage: 0.9 },
    { name: 'App', lineCoverage: 0.7 },
  ] }))
  assert.equal(parsed.targets.length, 2)
  assert.equal(parsed.targets[0].percent, 90)
  assert.equal(parsed.overall, 80)
})

test('parseXccovCoverage：坏 JSON 返回 null', async () => {
  const { parseXccovCoverage } = await import('../core/health.js')
  assert.equal(parseXccovCoverage('nope'), null)
})

test('summarizeArchitecture：退出码与最后一行', async () => {
  const { summarizeArchitecture } = await import('../core/health.js')
  const bad = summarizeArchitecture(1, '违规: 2 处\n→ 先拆文件\n')
  assert.equal(bad.ok, false)
  assert.match(bad.summary, /先拆文件/)
  const good = summarizeArchitecture(0, '✅ 架构检查通过\n')
  assert.equal(good.ok, true)
})

test('parsePeriphery：数组与 {results} 两种形状都能读，按 kind 计数', async () => {
  const { parsePeriphery } = await import('../core/health.js')
  const rows = [
    { kind: 'class', name: 'Foo', location: '/x/Foo.swift:10' },
    { kind: 'function', name: 'bar', location: '/x/Bar.swift:2' },
    { kind: 'function', name: 'baz', location: '/x/Bar.swift:20' },
  ]
  const direct = parsePeriphery(JSON.stringify(rows))
  assert.equal(direct.total, 3)
  assert.equal(direct.byKind[0].kind, 'function')
  assert.equal(direct.byKind[0].count, 2)
  const wrapped = parsePeriphery(JSON.stringify({ results: rows }))
  assert.equal(wrapped.total, 3)
})

test('parsePeriphery：坏 JSON 返回 null', async () => {
  const { parsePeriphery } = await import('../core/health.js')
  assert.equal(parsePeriphery('not json'), null)
})

test('assessHealth：超限与 Error 级给 bad，并带编号', async () => {
  const { assessHealth } = await import('../core/health.js')
  const result = assessHealth({
    oversize: [{ path: '/x/Big.swift', lines: 620 }],
    lint: { total: 3, byRule: [{ rule: 'function_body_length', count: 3, severity: 'Error' }] },
  })
  assert.equal(result.level, 'bad')
  assert.equal(result.ruleId, 'G.1.1')
  assert.ok(result.reasons.join(' ').includes('620'))
})

test('assessHealth：干净仓库给 ok', async () => {
  const { assessHealth } = await import('../core/health.js')
  assert.equal(assessHealth({}).level, 'ok')
})
