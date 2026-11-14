import test from 'node:test'
import assert from 'node:assert/strict'
import { parseLogRecords } from '../core/logs.js'

const raw = JSON.stringify([
  { timestamp: '2026-11-14 15:38:34.365936+0800', subsystem: 'com.ruska.dsh', category: 'rpc', eventMessage: 'send session/page ok' },
  { timestamp: '2026-11-14 15:38:35.000001+0800', subsystem: 'com.apple.xpc', category: 'connection', eventMessage: 'activating connection' },
  { timestamp: '2026-11-14 15:38:36.000000+0800', subsystem: 'com.ruska.dsh', category: 'ws', eventMessage: 'WS reconnect attempt 2' },
])

test('按关键字过滤（大小写不敏感）', () => {
  const events = parseLogRecords(raw, { grep: 'reconnect' })
  assert.equal(events.length, 1)
  assert.match(events[0].message, /WS reconnect/)
})

test('limit 取最后 N 条', () => {
  const events = parseLogRecords(raw, { limit: 1 })
  assert.equal(events.length, 1)
  assert.match(events[0].message, /reconnect/)
})

test('时间转 ISO', () => {
  const events = parseLogRecords(raw, {})
  assert.equal(events[0].t, '2026-11-14T07:38:34.365Z')
})

test('坏 JSON / 非数组返回空', () => {
  assert.deepEqual(parseLogRecords('not json', {}), [])
  assert.deepEqual(parseLogRecords('{"a":1}', {}), [])
})

test('缺 eventMessage 的记录被跳过', () => {
  const events = parseLogRecords(JSON.stringify([{ timestamp: 'x' }, { eventMessage: 'ok' }]), {})
  assert.equal(events.length, 1)
})
