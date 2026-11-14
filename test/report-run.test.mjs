import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateReport } from '../core/report-run.js'

const runDir = fileURLToPath(new URL('./fixtures/run-1/', import.meta.url))

test('generateReport：写到指定目录并返回路径', async () => {
  const outDir = await mkdtemp(join(tmpdir(), 'dsh-report-'))
  const result = await generateReport({ dir: runDir, project: 'demo', title: '测试', slug: 'x', outDir })
  assert.equal(result.ok, true)
  assert.ok(result.path.startsWith(outDir))
  const text = await (await import('node:fs/promises')).readFile(result.path, 'utf8')
  assert.ok(text.includes('## 摘要'))
  assert.ok(text.includes('> **项目**：demo'))
})

test('generateReport：空 run 报错', async () => {
  const empty = await mkdtemp(join(tmpdir(), 'dsh-empty-'))
  await assert.rejects(() => generateReport({ dir: empty, project: 'demo' }), /没有事件|readFile|ENOENT/)
})

test('generateReport：outFile 是精确路径', async () => {
  const outDir = await mkdtemp(join(tmpdir(), 'dsh-report2-'))
  const exact = join(outDir, 'exact.md')
  const result = await generateReport({ dir: runDir, project: 'demo', outFile: exact })
  assert.equal(result.path, exact)
})
