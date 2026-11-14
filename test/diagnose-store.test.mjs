import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appendDiagnose, listDiagnoses } from '../core/diagnose-store.js'

test('追加两条后按时间倒序读出', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'diag-store-'))
  process.env.DIAG_STORE = join(dir, 'd.jsonl')
  const record = (id) => ({ id, at: '2026-11-14T10:00:00.000Z', level: 'ok', headline: id })
  await appendDiagnose({ ...record('diag-1') })
  await appendDiagnose({ ...record('diag-2') })
  const rows = await listDiagnoses({ limit: 10 })
  delete process.env.DIAG_STORE
  assert.equal(rows.length, 2)
  assert.equal(rows[0].id, 'diag-2')
})
