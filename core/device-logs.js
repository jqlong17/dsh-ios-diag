// core/device-logs.js · 真机日志（xctrace Logging 模板）
//
// 不用 idevicesyslog：它走 usbmuxd，而网络配对（CoreDevice/localNetwork）的设备它看不到。
// xctrace 的 Logging 模板和内存录制走同一条通道，所以网络连接也能录。
//
// 产物是 os-log 表：每行一条 os_log，message 在 <os-log-metadata fmt="…"> 里。
import { rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { clamp, exec } from './util.js'
import { waitForOnlineDevices } from './trace.js'

/// 解析 os-log 表。时间列是「相对录制开始的纳秒」，必须用 TOC 的 start-date 锚。
export function parseOsLog(xml, { startDate, grep = '', limit = 200 } = {}) {
  const base = startDate ? Date.parse(startDate) : NaN
  const fmtById = new Map()
  const idTagRe = /<([a-zA-Z][\w-]*)\b([^>]*?)\sid="(\d+)"([^>]*)>/g
  let match
  while ((match = idTagRe.exec(xml))) {
    const attrs = `${match[2]} ${match[4]}`
    const fmt = /fmt="([^"]*)"/.exec(attrs)
    fmtById.set(match[3], fmt ? fmt[1] : '')
  }

  function field(row, tag) {
    const re = new RegExp(`<${tag}\\b([^>]*?)(?:/>|>([^<]*)<)`, 'g')
    let last = null
    let m
    while ((m = re.exec(row))) last = m
    if (!last) return ''
    const attrs = last[1] || ''
    const fmt = /fmt="([^"]*)"/.exec(attrs)
    if (fmt) return fmt[1]
    const ref = /ref="(\d+)"/.exec(attrs)
    if (ref) return fmtById.get(ref[1]) || ''
    return (last[2] || '').trim()
  }

  const needle = String(grep || '').toLowerCase()
  const events = []
  const rowRe = /<row>([\s\S]*?)<\/row>/g
  while ((match = rowRe.exec(xml))) {
    const row = match[1]
    const ns = Number((/<event-time[^>]*>(\d+)<\/event-time>/.exec(row) || [])[1])
    if (!Number.isFinite(ns)) continue
    const message = field(row, 'os-log-metadata') || field(row, 'format-string')
    if (!message) continue
    if (needle && !message.toLowerCase().includes(needle)) continue
    events.push({
      t: Number.isFinite(base) ? new Date(base + ns / 1e6).toISOString() : String(ns),
      process: field(row, 'process'),
      type: field(row, 'event-type') || 'Default',
      subsystem: field(row, 'subsystem'),
      category: field(row, 'category'),
      message: message.slice(0, 300),
    })
  }
  return events.slice(-clamp(Number(limit) || 200, 1, 1000))
}

export async function recordDeviceLogs(sampler, payload = {}) {
  const bundleId = String(payload.bundleId || '').trim()
  if (!bundleId) throw new Error('需要 bundleId（真机上 App 的标识）')
  const seconds = clamp(Number(payload.seconds) || 8, 3, 30)
  const limit = clamp(Number(payload.limit) || 100, 1, 500)
  const grep = String(payload.grep || '')

  let udid = String(payload.udid || '').trim()
  let deviceName = ''
  const devices = await waitForOnlineDevices()
  const online = devices.filter((item) => item.online)
  if (!udid) {
    if (!online.length) throw new Error('没有检测到在线的真机：用 USB 连接、解锁并信任这台电脑')
    udid = online[0].udid
    deviceName = online[0].name
  } else {
    const found = devices.find((item) => item.udid === udid)
    if (found) {
      if (!found.online) throw new Error(`${found.name} 当前离线：需要 USB 连接并保持解锁`)
      deviceName = found.name
    }
  }

  const output = join(tmpdir(), `dsh-ios-diag-log-${sampler.tag}.trace`)
  await rm(output, { recursive: true, force: true })
  try {
    const record = await exec('xcrun', [
      'xctrace', 'record', '--device', udid, '--template', 'Logging',
      '--time-limit', `${seconds}s`, '--no-prompt', '--output', output, '--launch', bundleId,
    ], (seconds + 90) * 1000)
    if (record.code !== 0) {
      throw new Error((record.stderr || '').trim().slice(-400) || `xctrace record 退出码 ${record.code}`)
    }
    const toc = await exec('xcrun', ['xctrace', 'export', '--toc', '--input', output], 30000)
    const startDate = (/<start-date>([^<]+)<\/start-date>/.exec(toc.stdout) || [])[1]
    const exported = await exec('xctrace', [
      'export', '--input', output,
      '--xpath', '/trace-toc/run[@number="1"]/data/table[@schema="os-log"]',
    ], 120000)
    if (exported.code !== 0) {
      throw new Error((exported.stderr || '').trim().slice(-400) || 'xctrace export 失败')
    }
    const events = parseOsLog(exported.stdout, { startDate, grep, limit })
    return {
      ok: true,
      deviceName,
      bundleId,
      seconds,
      count: events.length,
      events,
      hint: '只包含 os_log（不含 syslog）。grep 是消息子串过滤；日志可能含用户内容。',
    }
  } finally {
    await rm(output, { recursive: true, force: true }).catch(() => {})
  }
}
