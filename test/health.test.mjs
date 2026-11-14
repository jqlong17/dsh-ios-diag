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
