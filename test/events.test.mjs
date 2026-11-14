import test from 'node:test'
import assert from 'node:assert/strict'
import { createEvent, memSampleEvent, markEvent, logEvent, buildLinks, serializeJsonl } from '../core/events.js'

test('createEvent：ts 默认 ISO，缺 type 报错', () => {
  const event = createEvent({ type: 'mark', id: 'mark:1', attrs: { label: 'x' } })
  assert.match(event.ts, /^\d{4}-\d{2}-\d{2}T/)
  assert.equal(event.sessionId, null)
  assert.throws(() => createEvent({ id: 'x' }), /type/)
})

test('memSampleEvent：id 带前缀、属性是 MB', () => {
  const event = memSampleEvent(
    { seq: 7, t: Date.parse('2026-11-14T07:39:38.000Z'), total: 204472320, categories: [{ name: 'Malloc Nano', bytes: 1 }] },
    { sessionId: 'run:1', pid: 42 },
  )
  assert.equal(event.type, 'mem_sample')
  assert.equal(event.id, 'mem:7')
  assert.equal(event.attrs.totalMB, 195)
  assert.equal(event.attrs.top, 'Malloc Nano')
  assert.equal(event.pid, 42)
})

test('logEvent：消息截断 200 字', () => {
  const event = logEvent({ t: '2026-11-14T07:39:38.000Z', subsystem: 'a', category: 'b', message: 'x'.repeat(500) }, { index: 1 })
  assert.equal(event.id, 'log:1')
  assert.equal(event.attrs.message.length, 200)
})

test('buildLinks：所有事件 contained_in run，打点区间内的样本 contained_in 打点', () => {
  const events = [
    markEvent({ t: '2026-11-14T07:39:30.000Z', label: 'enter' }, { index: 1 }),
    memSampleEvent({ seq: 1, t: Date.parse('2026-11-14T07:39:35.000Z'), total: 1048576, categories: [] }, {}),
    memSampleEvent({ seq: 2, t: Date.parse('2026-11-14T07:40:00.000Z'), total: 1048576, categories: [] }, {}),
  ]
  const links = buildLinks(events, '1')
  const runLinks = links.filter((link) => link.to === 'run:1')
  assert.equal(runLinks.length, 3)
  assert.ok(runLinks.every((link) => link.method === 'id' && link.confidence === 1))
  // 打点开一个区间：从它开始、到下一个打点为止；只有一个打点时后面全在区间内。
  const markLinks = links.filter((link) => link.to === 'mark:1')
  assert.equal(markLinks.length, 2)
  assert.deepEqual(markLinks.map((link) => link.from), ['mem:1', 'mem:2'])
  assert.equal(markLinks[0].method, 'time')
  assert.ok(markLinks[0].confidence < 1)
})

test('serializeJsonl：一行一个合法 JSON，可读回', () => {
  const text = serializeJsonl([{ a: 1 }, { b: 2 }])
  const lines = text.trim().split('\n')
  assert.equal(lines.length, 2)
  assert.deepEqual(JSON.parse(lines[1]), { b: 2 })
})
