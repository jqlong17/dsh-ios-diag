// 代码健康扫描：对任意仓库只读扫描，报告写回本仓库。
//
//   node scripts/health-scan.mjs --target /path/to/repo --project dsh-pocket-ios
//     [--coverage-json x.json] [--arch] [--periphery-project X.xcodeproj --periphery-schemes App] [--gate]
//
// 逻辑在 core/health-run.js；面板的「代码」页走同一个函数。
import { isAbsolute, resolve, basename } from 'node:path'
import { scanHealth } from '../core/health-run.js'

const args = process.argv.slice(2)
const option = (name) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}
const flag = (name) => args.includes(name)

const targetArg = option('--target')
if (!targetArg) {
  console.error('用法: node scripts/health-scan.mjs --target <目录> [--project <slug>] [--gate]')
  process.exit(2)
}
const target = isAbsolute(targetArg) ? targetArg : resolve(targetArg)
const project = option('--project') || basename(target)
const minCoverage = Number(option('--min-coverage')) || 85

const result = await scanHealth({
  target,
  project,
  limit: Number(option('--limit')) || 400,
  coveragePath: option('--coverage-json'),
  arch: flag('--arch'),
  periphery: option('--periphery-project')
    ? { project: resolve(option('--periphery-project')), schemes: option('--periphery-schemes') }
    : null,
  minCoverage,
  outFile: option('--out') ? resolve(option('--out')) : undefined,
})

console.log(result.path)
console.log(`文件 ${result.files} · 超限 ${result.oversize.length} · lint ${result.lint.total}${result.coverage ? ` · 覆盖 ${result.coverage.overall}%` : ''}${result.architecture ? ` · 架构 ${result.architecture.ok ? '通过' : '违规'}` : ''}`)

const gateFailed = result.oversize.length > 0
  || result.lint.byRule.some((entry) => entry.severity === 'Error')
  || (result.coverage ? result.coverage.overall < minCoverage : false)
  || (result.architecture ? !result.architecture.ok : false)
if (flag('--gate') && gateFailed) process.exit(1)
