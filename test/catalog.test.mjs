import test from 'node:test'
import assert from 'node:assert/strict'
import { CATALOG, catalogFlat, catalogFind } from '../core/catalog.js'

test('编号唯一，且层级与父节点一致', () => {
  const flat = catalogFlat()
  const ids = flat.map((entry) => entry.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const entry of flat) {
    if (entry.id.includes('.')) {
      const parent = entry.id.slice(0, entry.id.lastIndexOf('.'))
      assert.ok(ids.includes(parent), `${entry.id} 缺父节点 ${parent}`)
    }
  }
})

test('每个模块都有说明', () => {
  for (const module of CATALOG) {
    assert.ok(module.title && module.summary, module.id)
  }
})

test('catalogFind：能按编号查到', () => {
  assert.equal(catalogFind('A.2.1').title, '持续上涨')
  assert.equal(catalogFind('ZZ'), null)
})
