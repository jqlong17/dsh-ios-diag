import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseJsonl, summarizeEvents, selectNeighborhood } from '../core/query.js'

const dir = fileURLToPath(new URL('./fixtures/run-1/', import.meta.url))
const events = parseJsonl(readFileSync(dir + 'events.jsonl', 'utf8'))
const links = parseJsonl(readFileSync(dir + 'links.jsonl', 'utf8'))

test('parseJsonl：坏行跳过', () => {
  const parsed = parseJsonl('{"a":1}\nnot json\n\n{"b":2}\n')
  assert.equal(parsed.length, 2)
})

test('summarizeEvents：按类型计数', () => {
  assert.deepEqual(summarizeEvents(events), { mark: 1, mem_sample: 2 })
})

test('按 id 取一跳：事实与推断分开', () => {
  const result = selectNeighborhood(events, links, { id: 'mem:1' })
  assert.equal(result.centers.length, 1)
  assert.equal(result.facts.length, 1)       // mem:1 -> run:1
  assert.equal(result.inferred.length, 1)    // mem:1 -> mark:1
  const nodeIds = result.nodes.map((node) => node.id).sort()
  assert.deepEqual(nodeIds, ['mark:1', 'mem:1'])
})

test('按 rpcId：没有匹配返回空且不抛', () => {
  const result = selectNeighborhood(events, links, { rpcId: 'nope' })
  assert.deepEqual(result.centers, [])
  assert.equal(result.empty, true)
})

test('未知 id 返回空', () => {
  const result = selectNeighborhood(events, links, { id: 'mem:999' })
  assert.equal(result.empty, true)
})
