// 代码健康扫描：对任意仓库只读扫描，输出 Markdown 报告到本仓库。
//
//   node scripts/health-scan.mjs --target /path/to/repo --project dsh-pocket-ios
//
// 做三件事：数行数（>400 行/文件）、跑 SwiftLint（若装了）、聚合后出报告。
// 不写目标仓库：SwiftLint 用本仓库的 configs/swiftlint.yml。
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { exec } from '../core/util.js'
import { countLines, findOversize, aggregateLint, parseXccovCoverage, summarizeArchitecture, renderHealthReport } from '../core/health.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const option = (name) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}
const flag = (name) => args.includes(name)

const targetArg = option('--target')
if (!targetArg) {
  console.error('用法: node scripts/health-scan.mjs --target <目录> [--project <slug>] [--limit 400] [--gate]')
  process.exit(2)
}
const target = isAbsolute(targetArg) ? targetArg : resolve(targetArg)
const project = option('--project') || basename(target)
const limit = Number(option('--limit')) || 400
const minCoverage = Number(option('--min-coverage')) || 85

const SKIP = new Set(['node_modules', '.git', '.build', 'DerivedData', 'Pods', 'vendor', 'dist', 'coverage', '_runs'])
const EXT = /\.(swift|js|mjs|ts)$/

async function walk(dir, out) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP.has(entry.name)) continue
      await walk(path, out)
    } else if (EXT.test(entry.name)) {
      out.push(path)
    }
  }
}

const paths = []
await walk(target, paths)
const files = []
for (const path of paths) {
  try {
    files.push({ path, lines: countLines(await readFile(path, 'utf8')) })
  } catch {
    // 读不到的跳过
  }
}
const oversize = findOversize(files, limit)

let lint = { total: 0, byRule: [], samples: [] }
const hasSwift = files.some((file) => file.path.endsWith('.swift'))
const hasSwiftLint = spawnSync('swiftlint', ['version'], { encoding: 'utf8' }).status === 0
if (hasSwift && hasSwiftLint) {
  const result = await exec('swiftlint', [
    'lint', '--config', join(root, 'configs', 'swiftlint.yml'),
    '--reporter', 'json', '--quiet', target,
  ], 300000)
  lint = aggregateLint(result.stdout || '[]')
  if (result.code !== 0 && !result.stdout.trim()) {
    console.error('swiftlint 失败：', (result.stderr || '').slice(-300))
  }
}

let coverage = null
const coveragePath = option('--coverage-json')
if (coveragePath) {
  try {
    coverage = parseXccovCoverage(await readFile(resolve(coveragePath), 'utf8'))
  } catch {
    coverage = null
  }
  if (!coverage) console.error('覆盖率 JSON 读不出来或没有 targets，已跳过')
}

let architecture = null
if (flag('--arch')) {
  const script = join(target, 'scripts', 'check-architecture.sh')
  try {
    await readFile(script)
    const result = await exec('bash', [script, '--facts'], 180000)
    architecture = summarizeArchitecture(result.code, `${result.stdout}\n${result.stderr}`)
  } catch {
    console.error('目标仓库没有 scripts/check-architecture.sh，跳过架构检查')
  }
}

const now = new Date()
const pad = (value) => String(value).padStart(2, '0')
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
const generatedAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
const markdown = renderHealthReport({ project, target, files, oversize, lint, coverage, architecture, minCoverage, generatedAt })

const out = option('--out')
  ? resolve(option('--out'))
  : join(root, 'docs', 'measurements', project, `${stamp}-health.md`)
await mkdir(dirname(out), { recursive: true })
await writeFile(out, markdown)

console.log(out)
console.log(`文件 ${files.length} · 超限 ${oversize.length} · lint ${lint.total}${hasSwiftLint ? '' : '（未装 swiftlint）'}${coverage ? ` · 覆盖 ${coverage.overall}%` : ''}${architecture ? ` · 架构 ${architecture.ok ? '通过' : '违规'}` : ''}`)
const gateFailed = oversize.length > 0
  || lint.byRule.some((entry) => entry.severity === 'Error')
  || (coverage ? coverage.overall < minCoverage : false)
  || (architecture ? !architecture.ok : false)
if (flag('--gate') && gateFailed) process.exit(1)
