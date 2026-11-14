// 把一份实测记录转成「可粘贴给被测项目」的消息（逻辑在 core/handoff.js）。
//
//   node scripts/handoff.mjs --report docs/measurements/<project>/<file>.md
import { readFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildHandoff } from '../core/handoff.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const option = (name) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

const reportArg = option('--report')
if (!reportArg) {
  console.error('用法: node scripts/handoff.mjs --report docs/measurements/<project>/<file>.md')
  process.exit(2)
}
const reportPath = isAbsolute(reportArg) ? reportArg : resolve(root, reportArg)
let text
try {
  text = await readFile(reportPath, 'utf8')
} catch {
  console.error(`读不到报告：${reportPath}`)
  process.exit(1)
}
process.stdout.write(buildHandoff(text, { reportPath, root }))
