import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseOsLog } from '../core/device-logs.js'

const xml = readFileSync(fileURLToPath(new URL('./fixtures/oslog.xml', import.meta.url)), 'utf8')

test('parseOsLog：time/process/type/message/subsystem', () => {
  const events = parseOsLog(xml, { startDate: '2026-11-14T09:40:00.000Z' })
  assert.equal(events.length, 2)
  assert.equal(events[0].process, 'DSH Pocket (42)')
  assert.equal(events[0].type, 'Default')
  assert.equal(events[0].message, 'send session/page ok')
  assert.equal(events[1].type, 'Error')
  assert.equal(events[1].subsystem, 'com.ruska.dsh')
  assert.equal(events[0].t, '2026-11-14T09:40:01.000Z')
})

test('parseOsLog：按 grep 过滤与 limit', () => {
  const errors = parseOsLog(xml, { startDate: '2026-11-14T09:40:00.000Z', grep: 'timeout' })
  assert.equal(errors.length, 1)
  const one = parseOsLog(xml, { startDate: '2026-11-14T09:40:00.000Z', limit: 1 })
  assert.equal(one.length, 1)
})

test('parseOsLog：空表返回 []', () => {
  assert.deepEqual(parseOsLog('<trace-query-result><node><schema></schema></node></trace-query-result>'), [])
})
