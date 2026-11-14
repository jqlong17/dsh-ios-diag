// core/preflight.js · 装真机前的体检清单
//
// 真机测试是高成本事件（人不在电脑边时尤其）。这条命令在模拟器上把
// 「上真机前该确认的事」过一遍，每条都给数字和算法，允许被推翻。
//
// 规则在 buildChecklist 里（纯函数、可单测）；采集在 runPreflight 里。
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bytesToMB, exec } from './util.js'
import { listTargets } from './targets.js'
import { queryLogs } from './logs.js'
import { parseCheckReport, buildCheckHandoff } from './handoff.js'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const RUNS_DIR = join(ROOT, 'docs', 'measurements', '_runs')
const CRASH_DIR = join(homedir(), 'Library', 'Logs', 'DiagnosticReports')

function makeItem(id, title, status, detail, how) {
  return { id, title, status, detail, how }
}

/// 纯规则。阈值都是经验值，写进 how，方便以后按项目调整。
export function buildChecklist(inputs) {
  const items = []

  items.push(inputs.running
    ? makeItem('running', '进程在跑', 'pass', `pid ${inputs.running.pid}`, 'simctl spawn launchctl list 能找到该 bundle')
    : makeItem('running', '进程在跑', 'fail', '没有运行中的进程', 'simctl spawn launchctl list 找不到该 bundle'))

  items.push(inputs.app && inputs.app.debug
    ? makeItem('build', '构建类型', 'warn', 'Debug 构建：内存/CPU 数字不代表真机', 'bundle 内存在 *.debug.dylib')
    : makeItem('build', '构建类型', 'pass', 'Release 构建（或没找到调试 dylib）', 'bundle 内没有 *.debug.dylib'))

  const memoryMB = inputs.memoryMB
  if (memoryMB === null || memoryMB === undefined) {
    items.push(makeItem('memory', '内存', 'unknown', '拿不到（进程不在跑？）', 'footprint -j <pid>'))
  } else if (memoryMB > 400) {
    items.push(makeItem('memory', '内存', 'fail', `${memoryMB} MB`, '> 400 MB：视图树或缓存可能有堆积'))
  } else if (memoryMB >= 200) {
    items.push(makeItem('memory', '内存', 'warn', `${memoryMB} MB`, '200–400 MB：留意是否随操作持续上涨'))
  } else {
    items.push(makeItem('memory', '内存', 'pass', `${memoryMB} MB`, '< 200 MB'))
  }

  const errors = inputs.logs ? inputs.logs.errors : 0
  const total = inputs.logs ? inputs.logs.total : 0
  if (!total) {
    // 「没日志」不等于「没问题」：App 可能压根没打 os_log，不能算 pass。
    items.push(makeItem('logs', '日志错误', 'unknown', '窗口内没有日志', '最近 120 秒没有该进程的 os_log；不等于没问题'))
  } else if (errors > 20) {
    items.push(makeItem('logs', '日志错误', 'fail', `${errors}/${total} 条`, '最近 120 秒内 error/fail/timeout/refused 超过 20 条'))
  } else if (errors > 5) {
    items.push(makeItem('logs', '日志错误', 'warn', `${errors}/${total} 条`, '最近 120 秒内错误 6–20 条'))
  } else {
    items.push(makeItem('logs', '日志错误', 'pass', `${errors}/${total} 条`, '最近 120 秒内错误 ≤ 5 条'))
  }

  const crashes = inputs.crashes || []
  items.push(crashes.length
    ? makeItem('crashes', '近期崩溃', 'warn', `${crashes.length} 份 .ips`, 'DiagnosticReports 里近 7 天匹配到该 App')
    : makeItem('crashes', '近期崩溃', 'pass', '0 份', 'DiagnosticReports 里近 7 天没有该 App 的 .ips'))

  const containerMB = inputs.containerMB
  if (containerMB === null || containerMB === undefined) {
    items.push(makeItem('container', '数据容器', 'unknown', '拿不到', 'simctl get_app_container + du -sk'))
  } else if (containerMB >= 200) {
    items.push(makeItem('container', '数据容器', 'warn', `${containerMB} MB`, '≥ 200 MB：检查缓存/日志文件是否无限增长'))
  } else {
    items.push(makeItem('container', '数据容器', 'pass', `${containerMB} MB`, '< 200 MB'))
  }

  const fail = items.some((item) => item.status === 'fail')
  const warn = items.some((item) => item.status === 'warn')
  return { verdict: fail ? 'fail' : warn ? 'warn' : 'pass', items }
}

async function appInfo(udid, bundleId, tag) {
  const list = await exec('xcrun', ['simctl', 'listapps', udid], 15000)
  if (list.code !== 0) return null
  const plist = join(tmpdir(), `preflight-apps-${tag}.plist`)
  await writeFile(plist, list.stdout)
  const json = await exec('plutil', ['-convert', 'json', '-o', '-', plist], 10000)
  if (json.code !== 0) return null
  const parsed = JSON.parse(json.stdout || '{}')
  const info = parsed[bundleId]
  if (!info) return null
  return {
    name: info.CFBundleDisplayName || info.CFBundleName || bundleId,
    version: info.CFBundleShortVersionString || '',
    build: info.CFBundleVersion || '',
  }
}

async function isDebugBuild(udid, bundleId) {
  const result = await exec('xcrun', ['simctl', 'get_app_container', udid, bundleId, 'app'], 10000)
  if (result.code !== 0) return false
  try {
    const entries = await readdir(result.stdout.trim())
    return entries.some((name) => name.endsWith('.debug.dylib'))
  } catch {
    return false
  }
}

async function footprintMB(tag, pid) {
  const file = join(tmpdir(), `preflight-fp-${tag}.json`)
  const result = await exec('/usr/bin/footprint', ['-j', file, String(pid)])
  if (result.code !== 0) return null
  try {
    const raw = JSON.parse(await readFile(file, 'utf8'))
    const proc = (raw.processes || [])[0]
    return proc ? bytesToMB(proc.footprint) : null
  } catch {
    return null
  }
}

async function recentCrashes(appName, bundleId) {
  const needle = String(bundleId || '').split('.').pop() || ''
  const candidates = [String(appName || '').replace(/\s+/g, ''), needle].filter(Boolean)
  let entries = []
  try {
    entries = await readdir(CRASH_DIR)
  } catch {
    return []
  }
  const cutoff = Date.now() - 7 * 24 * 3600 * 1000
  const hits = []
  for (const name of entries) {
    if (!name.endsWith('.ips')) continue
    if (!candidates.some((token) => name.includes(token))) continue
    try {
      const info = await stat(join(CRASH_DIR, name))
      if (info.mtimeMs >= cutoff) hits.push({ name, mtime: new Date(info.mtimeMs).toISOString() })
    } catch {
      // 忽略读不到的
    }
  }
  return hits
}

async function containerMB(udid, bundleId) {
  const result = await exec('xcrun', ['simctl', 'get_app_container', udid, bundleId, 'data'], 10000)
  if (result.code !== 0) return null
  const path = result.stdout.trim()
  if (!path) return null
  const du = await exec('du', ['-sk', path], 20000)
  if (du.code !== 0) return null
  const kb = Number((du.stdout || '').split(/\s+/)[0])
  return Number.isFinite(kb) ? Math.round(kb / 1024 * 10) / 10 : null
}

function renderReport(runId, checks, inputs) {
  const lines = []
  lines.push(`# 装真机前体检 · ${runId}`)
  lines.push('')
  lines.push(`- App：${inputs.app ? `${inputs.app.name} ${inputs.app.version} (${inputs.app.build})` : '未知'}`)
  lines.push(`- 结论：**${checks.verdict}**`)
  lines.push('')
  lines.push('| 项 | 状态 | 数值 | 依据 |')
  lines.push('| --- | --- | --- | --- |')
  for (const item of checks.items) {
    lines.push(`| ${item.title} | ${item.status} | ${item.detail} | ${item.how} |`)
  }
  lines.push('')
  lines.push('> 阈值是经验值；`unknown` 表示模拟器上拿不到，不代表没问题。')
  return lines.join('\n')
}

export async function runPreflight(sampler, payload = {}) {
  const bundleId = String(payload.bundleId || '').trim()
  if (!bundleId) throw new Error('需要 bundleId')
  const { devices } = await listTargets({ includeSystem: true }, sampler.tag)
  const device = payload.udid
    ? devices.find((item) => item.udid === payload.udid)
    : devices.find((item) => item.apps.some((app) => app.bundleId === bundleId))
  if (!device) throw new Error('找不到运行该 App 的模拟器')
  const app = device.apps.find((item) => item.bundleId === bundleId) || null

  const info = await appInfo(device.udid, bundleId, sampler.tag)
  const debug = await isDebugBuild(device.udid, bundleId)
  const memoryMB = app ? await footprintMB(sampler.tag, app.pid) : null
  let logs = { total: 0, errors: 0 }
  if (app) {
    try {
      const result = await queryLogs(sampler, { pid: app.pid, udid: device.udid, lastSeconds: 120, limit: 500 })
      logs = {
        total: result.events.length,
        errors: result.events.filter((event) => /error|fail|timeout|refused/i.test(event.message)).length,
      }
    } catch {
      logs = { total: 0, errors: 0 }
    }
  }
  const crashes = app ? await recentCrashes(info ? info.name : bundleId, bundleId) : []
  const container = app ? await containerMB(device.udid, bundleId) : null

  const inputs = {
    app: info ? { ...info, debug } : { name: bundleId, version: '', build: '', debug },
    running: app ? { pid: app.pid } : null,
    memoryMB,
    logs,
    crashes,
    containerMB: container,
  }
  const checks = buildChecklist(inputs)

  const pad = (value) => String(value).padStart(2, '0')
  const now = new Date()
  const runId = `preflight-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
  const dir = join(RUNS_DIR, runId)
  await mkdir(dir, { recursive: true })
  const markdown = renderReport(runId, checks, inputs)
  await writeFile(join(dir, 'report.md'), markdown)

  // 体检也是一次报告：直接把交接消息一起给出去，面板点完就能复制。
  const parsed = parseCheckReport(markdown)
  const handoff = buildCheckHandoff({ ...parsed, reportPath: join(dir, 'report.md'), root: ROOT })

  return {
    ok: true,
    runId,
    dir,
    verdict: checks.verdict,
    items: checks.items,
    handoff,
    hint: 'report.md 是给人看的版本；阈值是经验值，可在 spec 里讨论调整。',
  }
}
