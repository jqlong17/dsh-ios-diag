import test from 'node:test'
import assert from 'node:assert/strict'
import { TOOL_SPECS, toolInputSchema } from '../core.js'

test('工具表：8 个工具，名字唯一', () => {
  const names = TOOL_SPECS.map((spec) => spec.name)
  assert.equal(names.length, 8)
  assert.equal(new Set(names).size, names.length)
})

test('工具表：每个都有 handler 与 properties', () => {
  for (const spec of TOOL_SPECS) {
    assert.equal(typeof spec.handler, 'function', spec.name)
    assert.equal(typeof spec.properties, 'object', spec.name)
    assert.ok(spec.description.length > 10, spec.name)
  }
})

test('toolInputSchema：生成 object schema 且关闭额外参数', () => {
  const schema = toolInputSchema({ properties: { seconds: { type: 'integer' } } })
  assert.equal(schema.type, 'object')
  assert.equal(schema.additionalProperties, false)
  assert.deepEqual(schema.properties, { seconds: { type: 'integer' } })
})
