import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseAllocationStatistics, parseAllocationSummary } from '../core/allocations.js'

const fixture = readFileSync(fileURLToPath(new URL('./fixtures/allocations-statistics.xml', import.meta.url)), 'utf8')

test('按 persistent bytes 降序，MB 保留一位小数', () => {
  const rows = parseAllocationStatistics(fixture)
  assert.deepEqual(rows.map((row) => row.category), [
    '_DictionaryStorage<ObjectIdentifier, AnyTrackedValue>',
    'Malloc 16.00 KiB',
    'ImageIO & Friends',
    'VM: Stack',
  ])
  assert.equal(rows[0].liveMB, 8)
  assert.equal(rows[1].liveMB, 2.1)
  assert.equal(rows[0].liveCount, 12)
})

test('过滤 All … 汇总行，不混进类型排行', () => {
  const rows = parseAllocationStatistics(fixture)
  assert.ok(rows.every((row) => !row.category.startsWith('All ')))
})

test('HTML 实体被解码', () => {
  const rows = parseAllocationStatistics(fixture)
  assert.ok(rows.some((row) => row.category.includes('<ObjectIdentifier, AnyTrackedValue>')))
  assert.ok(rows.some((row) => row.category === 'ImageIO & Friends'))
})

test('缺 persistent-bytes 或为 0 的行被跳过', () => {
  const rows = parseAllocationStatistics(fixture)
  assert.ok(!rows.some((row) => row.category === 'NoLiveBytes'))
  assert.ok(!rows.some((row) => row.category === 'ZeroLive'))
})

test('空表返回空数组', () => {
  assert.deepEqual(parseAllocationStatistics('<trace-query-result><node></node></trace-query-result>'), [])
})

test('limit 截断', () => {
  const rows = parseAllocationStatistics(fixture, 2)
  assert.equal(rows.length, 2)
})

test('VM 预留不进类型排行，单独统计', () => {
  const rows = parseAllocationStatistics(fixture)
  assert.ok(!rows.some((row) => /reservation/i.test(row.category)))
  const summary = parseAllocationSummary(fixture)
  assert.equal(summary.heap, 15123008)
  assert.equal(summary.total, 17121856)
  assert.equal(summary.reserved, 2147483648)
})
