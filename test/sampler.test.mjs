import test from 'node:test'
import assert from 'node:assert/strict'
import { MemorySampler } from '../core.js'

function fill(sampler, totals) {
  const now = Date.now()
  sampler.session.samples = totals.map((total, index) => ({
    seq: index + 1,
    t: now - (totals.length - index) * 1000,
    total,
    categories: [{ name: 'footprint', bytes: total }],
  }))
  sampler.session.seq = totals.length
}

test('summarize：当前 / 峰值 / 增量', () => {
  const sampler = new MemorySampler()
  fill(sampler, [1048576, 2097152, 3145728].map((v) => v * 100))
  const summary = sampler.summarize(60)
  assert.equal(summary.currentMB, 300)
  assert.equal(summary.peakMB, 300)
  assert.equal(summary.minMB, 100)
  assert.equal(summary.deltaMB, 200)
})

test('summarize：没有样本返回 null', () => {
  assert.equal(new MemorySampler().summarize(60), null)
})

test('snapshot：since 只返回更大的 seq', () => {
  const sampler = new MemorySampler()
  fill(sampler, [1048576, 2097152, 3145728])
  const snapshot = sampler.snapshot({ since: 2 })
  assert.deepEqual(snapshot.samples.map((s) => s.seq), [3])
  assert.equal(snapshot.mode, 'live')
})

test('mark：空 label 报错，正常打点进 marks', () => {
  const sampler = new MemorySampler()
  assert.throws(() => sampler.mark({ label: '   ' }), /label/)
  const result = sampler.mark({ label: '进入会话' })
  assert.equal(result.marks, 1)
  assert.equal(sampler.session.marks[0].label, '进入会话')
})

test('clear：样本与打点归零', () => {
  const sampler = new MemorySampler()
  fill(sampler, [1048576])
  sampler.mark({ label: 'x' })
  sampler.clear()
  assert.equal(sampler.session.samples.length, 0)
  assert.equal(sampler.session.marks.length, 0)
  assert.equal(sampler.session.seq, 0)
})

test('sampleOnce：进程不存在时不抛异常（回归：this.findRunningApp）', async () => {
  const sampler = new MemorySampler()
  sampler.session.target = { udid: 'NOPE', bundleId: 'com.example.nope', pid: 999999, appName: 'x' }
  await sampler.sampleOnce()
  assert.match(sampler.session.error || '', /已退出|采样失败/)
})
