// core/diagnose-store.js · 诊断记录（append-only JSONL）
//
// 为什么用 JSONL：一行一条、只追加、不改写。历史记录读它，Markdown 只是它的视图。
// 文件：docs/measurements/diagnoses.jsonl
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
export const STORE = join(ROOT, 'docs', 'measurements', 'diagnoses.jsonl')

const storeFile = () => process.env.DIAG_STORE || STORE

export async function appendDiagnose(record) {
  const file = storeFile()
  await mkdir(dirname(file), { recursive: true })
  await appendFile(file, JSON.stringify(record) + '\n')
  return record.id
}

export async function listDiagnoses({ limit = 20 } = {}) {
  let text = ''
  try {
    text = await readFile(storeFile(), 'utf8')
  } catch {
    return []
  }
  const rows = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      rows.push(JSON.parse(line))
    } catch {
      // 坏行跳过，不影响其它记录
    }
  }
  return rows.reverse().slice(0, limit)
}
