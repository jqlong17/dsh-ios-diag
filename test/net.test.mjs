import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parseTsharkFields, analyzePcap } from '../core/net.js'

const sample = [
  '1794643000.000000000\t0\tGET\t/api/session/list\t\t',
  '1794643001.000000000\t0\t\t/api/session/list\t200\t',
  '1794643002.000000000\t1\t\t\t\t1',
  '',
].join('\n')

test('字段解析：请求 / 响应 / WS 帧', () => {
  const { events } = parseTsharkFields(sample)
  const types = events.map((event) => event.type)
  assert.deepEqual(types, ['rpc_request', 'rpc_response', 'ws_frame'])
  assert.equal(events[0].id, 'req:0:1')
  assert.equal(events[0].attrs.uri, '/api/session/list')
  assert.equal(events[1].attrs.status, 200)
  assert.equal(events[1].ts, '2026-11-14T07:56:41.000Z')
})

test('请求 → 响应链接：同流、method=id、置信度 < 1', () => {
  const { links } = parseTsharkFields(sample)
  assert.equal(links.length, 1)
  assert.equal(links[0].from, 'req:0:1')
  assert.equal(links[0].to, 'res:0:2')
  assert.equal(links[0].method, 'id')
  assert.ok(links[0].confidence < 1)
})

test('响应带 durationMs', () => {
  const { events } = parseTsharkFields(sample)
  assert.equal(events[1].attrs.durationMs, 1000)
})

test('空输出 / 坏行不抛', () => {
  assert.deepEqual(parseTsharkFields('').events, [])
  assert.deepEqual(parseTsharkFields('not\ta\tvalid\n').events, [])
})

const hasTshark = spawnSync('tshark', ['-v'], { encoding: 'utf8' }).status === 0
test('tshark 端到端：合成 pcap', { skip: !hasTshark }, async () => {
  const fixture = fileURLToPath(new URL('./fixtures/net-sample.pcap', import.meta.url))
  const result = await analyzePcap({ path: fixture })
  assert.equal(result.counts.rpc_request, 1)
  assert.equal(result.counts.rpc_response, 1)
  assert.equal(result.links.length, 1)
  assert.equal(result.events[0].attrs.uri, '/api/session/list')
})
