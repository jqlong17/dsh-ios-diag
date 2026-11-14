import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseSysmonTrace } from '../core.js'

const fixture = readFileSync(fileURLToPath(new URL('./fixtures/sysmon-process.xml', import.meta.url)), 'utf8')

test('parseSysmonTrace：取出现次数最多的进程，按时间给出 footprint', () => {
  const samples = parseSysmonTrace(fixture, 'dsh-pocket-ios')
  assert.equal(samples.length, 3)
  assert.deepEqual(samples.map((s) => s.total), [1572864, 1572864, 3145728])
  assert.equal(samples[0].categories[0].name, 'footprint')
  assert.equal(samples[0].categories[0].bytes, samples[0].total)
  assert.equal(samples[2].resident, 2097152)
  assert.equal(samples[2].compressed, 1048576)
})

test('parseSysmonTrace：时间戳单调，间隔等于原始纳秒差', () => {
  const samples = parseSysmonTrace(fixture, 'dsh-pocket-ios')
  assert.ok(samples[1].t > samples[0].t)
  assert.ok(samples[2].t > samples[1].t)
  assert.equal(samples[1].t - samples[0].t, 1000)
})

test('parseSysmonTrace：按名字匹配到目标进程', () => {
  const samples = parseSysmonTrace(fixture, 'springboard')
  assert.equal(samples.length, 1)
  assert.equal(samples[0].total, 9437184)
})

test('parseSysmonTrace：没有 footprint 列时明确报错', () => {
  const xml = '<trace-query-result><node><schema><col><mnemonic>time</mnemonic></col></schema><row><start-time>0</start-time></row></node></trace-query-result>'
  assert.throws(() => parseSysmonTrace(xml, 'x'), /time \/ footprint/)
})

test('parseSysmonTrace：空表返回空数组', () => {
  const xml = '<trace-query-result><node><schema><col><mnemonic>time</mnemonic></col><col><mnemonic>memory-physical-footprint</mnemonic></col></schema></node></trace-query-result>'
  assert.deepEqual(parseSysmonTrace(xml, 'x'), [])
})
