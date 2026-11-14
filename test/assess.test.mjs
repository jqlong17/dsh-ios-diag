import test from 'node:test'
import assert from 'node:assert/strict'
import { assessMemory } from '../core/assess.js'

function series(mbs, stepMs = 2600) {
  return mbs.map((mb, index) => ({ t: 1000000 + index * stepMs, total: mb * 1048576 }))
}

test('平稳：给 ok，并说明静置平稳不代表交互没问题', () => {
  const result = assessMemory({ samples: series([60, 60.5, 59.8, 60.2, 60.1, 60.3]), marks: [], windowSec: 60 })
  assert.equal(result.level, 'ok')
  assert.ok(result.headline.includes('平稳'))
  assert.ok(result.next.length > 0)
})

test('持续上涨：给 bad，并给泄漏判据', () => {
  const result = assessMemory({ samples: series([60, 62, 65, 68, 71, 74, 77, 80, 83, 86, 89, 92]), marks: [], windowSec: 60 })
  assert.equal(result.level, 'bad')
  assert.ok(result.reasons.some((text) => text.includes('每分钟')))
  assert.ok(result.next.some((text) => text.includes('3–5 次')))
})

test('样本太少：给 inconclusive，不硬下结论', () => {
  const result = assessMemory({ samples: series([60, 61]), marks: [], windowSec: 2 })
  assert.equal(result.level, 'inconclusive')
  assert.equal(result.stats, null)
})

test('峰值超 400MB：给 bad', () => {
  const result = assessMemory({ samples: series([380, 420, 410, 415, 430, 425]), marks: [], windowSec: 60 })
  assert.equal(result.level, 'bad')
  assert.ok(result.reasons[0].includes('400'))
})

test('启动爬坡：先丢掉 <10MB 的点再算趋势，不误报泄漏', () => {
  const result = assessMemory({ samples: series([0.1, 3, 40, 40.5, 40.2, 40.8, 40.6, 41]), marks: [], windowSec: 60 })
  assert.notEqual(result.level, 'bad')
})

test('短窗口急涨：给 watch，不直接判泄漏', () => {
  const result = assessMemory({ samples: series([30, 36, 42, 48, 51]), marks: [], windowSec: 60 })
  assert.equal(result.level, 'watch')
  assert.ok(result.headline.includes('窗口太短'))
})

test('阶梯上涨：涨完就平，给 watch 而不是泄漏', () => {
  const mbs = [60, 60, 60, 60, 100, 100, 100, 100, 100, 100]
  const result = assessMemory({ samples: series(mbs), marks: [], windowSec: 60 })
  assert.equal(result.level, 'watch')
  assert.ok(result.headline.includes('一次性'))
})
