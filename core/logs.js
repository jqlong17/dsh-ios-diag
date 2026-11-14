// core/logs.js · 日志取证与卡顿采样
//
// 这两个能力都复用系统自带工具，不自己解析协议、不 hook 进程：
//   - 统一日志：`xcrun simctl spawn <udid> log show --style json`
//   - 调用栈：  `sample <pid> <seconds> -file <path>`
//
// 为什么单独一个模块：它们是「一次性取证」，和 core/sampler.js 的长驻采样环
// 状态模型不同；放一起会让 session 的边界（谁在跑、谁有样本）变模糊。
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { alive, clamp, exec } from './util.js'
import { listTargets } from './targets.js'

/// `2026-11-14 15:38:34.365936+0800` → ISO8601；解析不了就原样保留。
/// 不用 Date.parse 直接吃原串：V8 对这种「空格分隔 + 微秒 + 无冒号时区」不稳定。
export function logTimeToISO(raw) {
  const text = String(raw || '')
  const match = text.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})\.(\d+)([+-]\d{4})$/)
  if (!match) return text
  const millis = match[3].slice(0, 3).padEnd(3, '0')
  const zone = `${match[4].slice(0, 3)}:${match[4].slice(3)}`
  const parsed = Date.parse(`${match[1]}T${match[2]}.${millis}${zone}`)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : text
}

/// 解析 `log show --style json` 的输出。
///
/// 只保留「人能读的那一句」：eventMessage 优先，没有就退回 formatString；
/// 超长（内嵌 JSON / 大 payload）截到 300 字——日志是取证线索，不是数据通道。
export function parseLogRecords(json, options = {}) {
  let records
  try {
    records = JSON.parse(json)
  } catch {
    return []
  }
  if (!Array.isArray(records)) return []
  const needle = String(options.grep || '').toLowerCase()
  const limit = clamp(Number(options.limit) || 200, 1, 1000)
  const events = []
  for (const record of records) {
    if (!record || typeof record !== 'object') continue
    const message = String(record.eventMessage || record.formatString || '').trim()
    if (!message) continue
    if (needle && !message.toLowerCase().includes(needle)) continue
    events.push({
      t: logTimeToISO(record.timestamp),
      subsystem: String(record.subsystem || ''),
      category: String(record.category || ''),
      message: message.slice(0, 300),
    })
  }
  return events.slice(-limit)
}

/// pid 优先；否则用 udid + bundleId 现找。和 ios_mem_start 的参数习惯保持一致。
async function resolveTarget(sampler, payload) {
  const pid = Number(payload.pid) || 0
  const udid = String(payload.udid || '').trim()
  const bundleId = String(payload.bundleId || '').trim()
  if (pid && udid) return { pid, udid }

  const { devices } = await listTargets({ includeSystem: true }, sampler.tag)
  let device = udid ? devices.find((item) => item.udid === udid) : undefined
  if (pid) {
    const owner = device || devices.find((item) => item.apps.some((app) => app.pid === pid))
    if (owner) return { pid, udid: owner.udid }
    if (device) return { pid, udid: device.udid }
  }
  for (const candidate of devices) {
    if (device && candidate.udid !== device.udid) continue
    const app = candidate.apps.find((item) => item.bundleId === bundleId)
    if (app) return { pid: app.pid, udid: candidate.udid }
  }
  throw new Error('找不到目标进程：传 pid，或 udid + bundleId')
}

/// 取最近 N 秒的 App 日志。模拟器专用：真机日志走 idevicesyslog，本版没做。
export async function queryLogs(sampler, payload = {}) {
  const { pid, udid } = await resolveTarget(sampler, payload)
  const lastSeconds = clamp(Number(payload.lastSeconds) || 60, 5, 300)
  const limit = clamp(Number(payload.limit) || 200, 1, 1000)
  const grep = String(payload.grep || '')

  const result = await exec('xcrun', [
    'simctl', 'spawn', udid, 'log', 'show',
    '--last', `${lastSeconds}s`,
    '--predicate', `processID == ${pid}`,
    '--style', 'json',
  ], (lastSeconds + 30) * 1000)
  if (result.code !== 0) {
    throw new Error((result.stderr || '').trim().slice(-300) || `log show 退出码 ${result.code}`)
  }

  const events = parseLogRecords(result.stdout, { grep, limit })
  return {
    ok: true,
    pid,
    lastSeconds,
    grep,
    count: events.length,
    events,
    hint: events.length
      ? '日志可能含用户消息内容，写进报告前先确认是否敏感。'
      : '这个窗口没有匹配的日志：换 grep、放大 lastSeconds，或确认 App 真的在打 os_log。',
  }
}

/// 对目标进程采 `sample`。主线程栈在返回的 path 里；preview 只给前 80 行。
export async function sampleHangs(sampler, payload = {}) {
  const { pid } = await resolveTarget(sampler, payload)
  const seconds = clamp(Number(payload.seconds) || 3, 1, 10)
  if (!alive(pid)) throw new Error(`进程 ${pid} 不在运行，先让 App 起来再采样`)

  const path = join(tmpdir(), `dsh-ios-diag-sample-${sampler.tag}-${Date.now()}.txt`)
  const result = await exec('sample', [String(pid), String(seconds), '-file', path], (seconds + 25) * 1000)
  if (result.code !== 0) {
    throw new Error((result.stderr || '').trim().slice(-300) || `sample 退出码 ${result.code}`)
  }
  const text = await readFile(path, 'utf8')
  return {
    ok: true,
    pid,
    seconds,
    path,
    bytes: text.length,
    mainThread: text.includes('com.apple.main-thread'),
    preview: text.split('\n').slice(0, 80).join('\n'),
    hint: 'path 是完整报告（临时文件，重启会清）；主线程栈搜 "com.apple.main-thread"。',
  }
}
