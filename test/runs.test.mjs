import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { listRuns } from '../core/runs.js'

const base = fileURLToPath(new URL('./fixtures/runs/', import.meta.url))

test('listRuns：按目录名倒序，带事件/链接数与报告标记', async () => {
  const runs = await listRuns({ base, limit: 10 })
  assert.equal(runs.length, 2)
  assert.equal(runs[0].runId, '20260101-1300')
  assert.equal(runs[0].events, 3)
  assert.equal(runs[0].links, 5)
  assert.equal(runs[0].hasReport, true)
  assert.equal(runs[1].hasReport, false)
})

test('listRuns：limit 生效', async () => {
  const runs = await listRuns({ base, limit: 1 })
  assert.equal(runs.length, 1)
})

test('listRuns：目录不存在返回空', async () => {
  assert.deepEqual(await listRuns({ base: '/tmp/does-not-exist-xyz' }), [])
})

test('listRuns：体检目录标成 preflight', async () => {
  const { mkdtemp, mkdir, writeFile } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const base = await mkdtemp(join(tmpdir(), 'dsh-runs-'))
  await mkdir(join(base, 'preflight-20261114-1847'), { recursive: true })
  await writeFile(join(base, 'preflight-20261114-1847', 'report.md'), '# 体检')
  const runs = await listRuns({ base, limit: 5 })
  assert.equal(runs[0].kind, 'preflight')
})
