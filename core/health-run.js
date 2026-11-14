// core/health-run.js · 代码健康扫描的执行层（脚本与面板共用）
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { exec } from './util.js'
import { countLines, findOversize, aggregateLint, parseXccovCoverage, summarizeArchitecture, parsePeriphery, renderHealthReport } from './health.js'

const ROOT = fileURLToPath(new URL('../', import.meta.url))

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

export async function scanHealth({ target, project, limit = 400, coveragePath, arch = false, periphery, minCoverage = 85, outFile } = {}) {
  const paths = []
  await walk(target, paths)
  const files = []
  for (const path of paths) {
    try {
      files.push({ path, lines: countLines(await readFile(path, 'utf8')) })
    } catch {
      // 读不到就跳过
    }
  }
  const oversize = findOversize(files, limit)

  let lint = { total: 0, byRule: [], samples: [] }
  const hasSwift = files.some((file) => file.path.endsWith('.swift'))
  const hasSwiftLint = spawnSync('swiftlint', ['version'], { encoding: 'utf8' }).status === 0
  if (hasSwift && hasSwiftLint) {
    const result = await exec('swiftlint', [
      'lint', '--config', join(ROOT, 'configs', 'swiftlint.yml'),
      '--reporter', 'json', '--quiet', target,
    ], 300000)
    lint = aggregateLint(result.stdout || '[]')
  }

  let coverage = null
  if (coveragePath) {
    try {
      coverage = parseXccovCoverage(await readFile(coveragePath, 'utf8'))
    } catch {
      coverage = null
    }
  }

  let architecture = null
  if (arch) {
    const script = join(target, 'scripts', 'check-architecture.sh')
    try {
      await readFile(script)
      const result = await exec('bash', [script, '--facts'], 180000)
      architecture = summarizeArchitecture(result.code, `${result.stdout}\n${result.stderr}`)
    } catch {
      architecture = null
    }
  }

  let unused = null
  if (periphery) {
    const args = ['scan', '--project', periphery.project, '--format', 'json']
    if (periphery.schemes) args.push('--schemes', periphery.schemes)
    const result = await exec('periphery', args, 600000)
    unused = parsePeriphery(result.stdout)
  }

  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
  const generatedAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
  const markdown = renderHealthReport({ project, target, files, oversize, lint, coverage, architecture, periphery: unused, minCoverage, generatedAt })
  const path = outFile || join(ROOT, 'docs', 'measurements', project, `${stamp}-health.md`)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, markdown)

  return {
    project, target, path,
    files: files.length,
    lines: files.reduce((sum, file) => sum + file.lines, 0),
    oversize, lint, coverage, architecture, unused,
  }
}
