import test from 'node:test'
import assert from 'node:assert/strict'
import { buildChecklist } from '../core/preflight.js'

const base = {
  app: { name: 'DSH Pocket', version: '1.0.8', build: '10', debug: false },
  running: { pid: 42 },
  memoryMB: 50,
  logs: { total: 100, errors: 2 },
  crashes: [],
  containerMB: 100,
}

function statusOf(result, id) {
  return result.items.find((item) => item.id === id).status
}

test('全 pass：6 项、verdict=pass', () => {
  const result = buildChecklist(base)
  assert.equal(result.items.length, 6)
  assert.equal(result.verdict, 'pass')
  assert.ok(result.items.every((item) => item.how))
})

test('进程不在：running=fail，内存 unknown，整体 fail', () => {
  const result = buildChecklist({ ...base, running: null, memoryMB: null })
  assert.equal(statusOf(result, 'running'), 'fail')
  assert.equal(statusOf(result, 'memory'), 'unknown')
  assert.equal(result.verdict, 'fail')
})

test('内存三档：199 pass / 250 warn / 401 fail', () => {
  assert.equal(statusOf(buildChecklist({ ...base, memoryMB: 199 }), 'memory'), 'pass')
  assert.equal(statusOf(buildChecklist({ ...base, memoryMB: 250 }), 'memory'), 'warn')
  assert.equal(statusOf(buildChecklist({ ...base, memoryMB: 401 }), 'memory'), 'fail')
})

test('日志错误三档：5 pass / 6 warn / 21 fail', () => {
  const withErrors = (errors) => buildChecklist({ ...base, logs: { total: 100, errors } })
  assert.equal(statusOf(withErrors(5), 'logs'), 'pass')
  assert.equal(statusOf(withErrors(6), 'logs'), 'warn')
  assert.equal(statusOf(withErrors(21), 'logs'), 'fail')
})

test('Debug 构建与近期崩溃都算 warn', () => {
  const result = buildChecklist({ ...base, app: { ...base.app, debug: true }, crashes: [{ name: 'a.ips' }] })
  assert.equal(statusOf(result, 'build'), 'warn')
  assert.equal(statusOf(result, 'crashes'), 'warn')
  assert.equal(result.verdict, 'warn')
})

test('容器大小 ≥200MB 算 warn', () => {
  assert.equal(statusOf(buildChecklist({ ...base, containerMB: 200 }), 'container'), 'warn')
})

test('窗口内没有日志算 unknown，而不是 pass', () => {
  const result = buildChecklist({ ...base, logs: { total: 0, errors: 0 } })
  assert.equal(statusOf(result, 'logs'), 'unknown')
})
