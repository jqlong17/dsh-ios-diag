import test from 'node:test'
import assert from 'node:assert/strict'
import { splitRegion, clamp, bytesToMB } from '../core.js'

test('splitRegion：带路径的拆成 tag + 镜像名', () => {
  assert.deepEqual(splitRegion('__TEXT /usr/lib/libsystem_platform.dylib'), {
    tag: '__TEXT',
    image: 'libsystem_platform.dylib',
  })
})

test('splitRegion：没有路径的整串当 tag，不进镜像维度', () => {
  assert.deepEqual(splitRegion('Malloc Tiny'), { tag: 'Malloc Tiny', image: null })
  assert.deepEqual(splitRegion('CoreAnimation'), { tag: 'CoreAnimation', image: null })
})

test('splitRegion：空串兜底', () => {
  assert.deepEqual(splitRegion(''), { tag: 'Unknown', image: null })
})

test('clamp 边界', () => {
  assert.equal(clamp(5, 1, 10), 5)
  assert.equal(clamp(0, 1, 10), 1)
  assert.equal(clamp(11, 1, 10), 10)
})

test('bytesToMB 保留一位小数', () => {
  assert.equal(bytesToMB(1048576), 1)
  assert.equal(bytesToMB(1572864), 1.5)
  assert.equal(bytesToMB(0), 0)
})
