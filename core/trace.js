// core/trace.js · xctrace 相关：真机目标、sysmon 解析、录制编排
//
// 真机进程 attach 不了，只能「录一段再回放」。这里只做录制与解析，不碰实时采样环；
// sampler 通过一行委托调用它，避免把 522 行的状态机继续撑大。
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { clamp, bytesToMB, exec } from './util.js'

export function parseSysmonTrace(xml, appName = '') {
  const columns = []
  const colRe = /<mnemonic>([^<]*)<\/mnemonic>/g
  let match
  while ((match = colRe.exec(xml))) columns.push(match[1])

  const fmtById = new Map()
  const textById = new Map()
  const idTagRe = /<([a-zA-Z][\w-]*)\b([^>]*?)\sid="(\d+)"([^>]*)>/g
  while ((match = idTagRe.exec(xml))) {
    const attrs = `${match[2]} ${match[4]}`
    const fmt = /fmt="([^"]*)"/.exec(attrs)
    fmtById.set(match[3], fmt ? fmt[1] : '')
  }
  const idTextRe = /<([a-zA-Z][\w-]*)\b([^>]*?)\sid="(\d+)"[^>]*>([^<]+)<\/\1>/g
  while ((match = idTextRe.exec(xml))) textById.set(match[3], match[4].trim())

  const rows = []
  const rowRe = /<row>([\s\S]*?)<\/row>/g
  while ((match = rowRe.exec(xml))) {
    let processName = ''
    // 把 <process>…</process> 压成一个空元素：保留它在列序列里的位置，
    // 否则后面的值会整体左移，resident / compressed 全错位。
    const flat = match[1].replace(/<process\b([^>]*?)(?:\/>|>[\s\S]*?<\/process>)/g, (_all, attrs) => {
      if (!processName) {
        const fmt = /fmt="([^"]*)"/.exec(attrs)
        const ref = /ref="(\d+)"/.exec(attrs)
        processName = fmt ? fmt[1] : ref ? (fmtById.get(ref[1]) || '') : ''
      }
      return '<process/>'
    })
    const values = []
    const valueRe = /<([a-zA-Z][\w-]*)\b([^>]*?)(?:\/>|>([^<]*)<\/\1>)/g
    let value
    while ((value = valueRe.exec(flat))) {
      let text = value[3] !== undefined ? value[3] : ''
      if (!text) {
        const ref = /ref="(\d+)"/.exec(value[2] || '')
        if (ref) text = textById.get(ref[1]) || ''
      }
      values.push(text.trim())
    }
    if (processName) rows.push({ processName, values })
  }

  const timeIndex = columns.indexOf('time')
  const footprintIndex = columns.indexOf('memory-physical-footprint')
  const residentIndex = columns.indexOf('memory-resident-size')
  const compressedIndex = columns.indexOf('memory-compressed')
  if (timeIndex < 0 || footprintIndex < 0) {
    throw new Error('trace 里没有 sysmon-process 的 time / footprint 列')
  }

  // 先按传入的 App 名匹配；匹配不到就退回到「出现次数最多的进程」
  // （Activity Monitor 只录被 launch 的那一个，名字是展示名而不是 bundle 末段）。
  let picked = appName
    ? rows.filter((row) => row.processName.toLowerCase().includes(appName.toLowerCase()))
    : []
  if (!picked.length) {
    const counts = new Map()
    for (const row of rows) counts.set(row.processName, (counts.get(row.processName) || 0) + 1)
    let dominant = ''
    let best = 0
    for (const [name, count] of counts) {
      if (count > best) {
        best = count
        dominant = name
      }
    }
    picked = rows.filter((row) => row.processName === dominant)
  }
  if (!picked.length) return []

  let base = Infinity
  for (const row of picked) {
    const value = Number(row.values[timeIndex])
    if (Number.isFinite(value) && value < base) base = value
  }

  return picked.map((row, index) => {
    const ns = Number(row.values[timeIndex]) || 0
    const total = Number(row.values[footprintIndex]) || 0
    return {
      seq: index + 1,
      t: Math.round(base / 1e6 + ns / 1e6),
      total,
      categories: [{ name: 'footprint', bytes: total }],
      resident: Number(row.values[residentIndex]) || 0,
      compressed: Number(row.values[compressedIndex]) || 0,
    }
  })
}

export async function physicalDevices() {
  const result = await exec('xcrun', ['xctrace', 'list', 'devices'], 20000)
  if (result.code !== 0) return []
  const devices = []
  let section = ''
  for (const line of result.stdout.split('\n')) {
    const heading = line.match(/^==\s*(.+?)\s*==$/)
    if (heading) {
      section = heading[1]
      continue
    }
    // 同时读「Devices」和「Devices Offline」：无线连接（localNetwork）的机子会落在离线段，
    // 只读在线段会得到「没有检测到真机」，让人误以为没插线。
    if (section !== 'Devices' && section !== 'Devices Offline') continue
    const text = line.trim()
    if (!text || /MacBook|Mac mini|Mac Studio|iMac|Mac Pro/i.test(text)) continue
    const match = text.match(/\(([0-9A-Fa-f]{8}-[0-9A-Fa-f]{16})\)\s*$/)
    if (!match) continue
    devices.push({ udid: match[1], name: text.split(' (')[0], online: section === 'Devices' })
  }
  return devices
}

/// 无线连接下 xctrace 的在线状态会抖：录一次能成功、下一次又「离线」。
/// 轮询几次，避免把一次抖动当成「设备不可用」。
export async function waitForOnlineDevices(attempts = 3, delayMs = 1000) {
  let devices = []
  for (let index = 0; index < attempts; index += 1) {
    devices = await physicalDevices()
    if (devices.some((item) => item.online)) return devices
    if (index < attempts - 1) await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
  return devices
}

/// 设备在 xctrace 里离线时的统一报错：最常见原因不是「没连」，而是无线连接/锁屏/没信任。
function offlineError(devices) {
  const offline = devices.filter((item) => !item.online)
  if (offline.length) {
    return new Error(`检测到 ${offline.length} 台真机但 xctrace 视为离线（${offline.map((item) => item.name).join('、')}）：需要 USB 连接并保持解锁，Wi-Fi 连接不稳定`)
  }
  return new Error('没有检测到已连接的真机：用 USB 连接、解锁并信任这台电脑')
}

/// 真机录一段：Activity Monitor 模板 → 导出 sysmon-process → 载入时间轴。
/// 真机进程 attach 不了，所以这里只能「录制回放」，不是实时采样。
export async function recordTrace(sampler, payload = {}) {
  const bundleId = String(payload.bundleId || '').trim()
  if (!bundleId) throw new Error('需要 bundleId（真机上 App 的标识）')
  const seconds = clamp(Number(payload.seconds) || 10, 3, 120)
  let udid = String(payload.udid || '').trim()
  let deviceName = ''
  const devices = await waitForOnlineDevices()
  const online = devices.filter((item) => item.online)
  if (!udid) {
    if (!online.length) throw offlineError(devices)
    udid = online[0].udid
    deviceName = online[0].name
  } else {
    const found = devices.find((item) => item.udid === udid)
    if (found) {
      if (!found.online) throw offlineError([found])
      deviceName = found.name
    }
  }

  const output = join(tmpdir(), `dsh-ios-diag-${sampler.tag}.trace`)
  await rm(output, { recursive: true, force: true })
  try {
    const record = await exec('xcrun', [
      'xctrace', 'record', '--device', udid, '--template', 'Activity Monitor',
      '--time-limit', `${seconds}s`, '--no-prompt', '--output', output, '--launch', bundleId,
    ], (seconds + 90) * 1000)
    if (record.code !== 0) {
      throw new Error((record.stderr || '').trim().slice(-400) || `xctrace record 退出码 ${record.code}`)
    }
    const exported = await exec('xctrace', [
      'export', '--input', output,
      '--xpath', '/trace-toc/run[@number="1"]/data/table[@schema="sysmon-process"]',
    ], 120000)
    if (exported.code !== 0) {
      throw new Error((exported.stderr || '').trim().slice(-400) || 'xctrace export 失败')
    }
    const app = bundleId.split('.').pop()
    const parsed = parseSysmonTrace(exported.stdout, app)
    if (!parsed.length) throw new Error('trace 里没有这个 App 的内存样本')
    // sysmon 的 time 是「从录制开始算」的相对纳秒；面板要的是墙钟毫秒，
    // 用 TOC 里的 start-date 做锚点，否则点会全部落在 1970 年。
    const toc = await exec('xctrace', ['export', '--toc', '--input', output], 30000)
    const anchor = /<start-date>([^<]+)<\/start-date>/.exec(toc.stdout)
    const baseMs = anchor ? Date.parse(anchor[1]) : Date.now() - parsed[parsed.length - 1].t
    const samples = parsed.map((sample) => ({ ...sample, t: Math.round(baseMs + sample.t) }))
    if (!Number.isFinite(samples[0].t)) throw new Error('trace 的起始时间解析失败')

    sampler.stop()
    sampler.session.mode = 'trace'
    sampler.session.target = { udid, deviceName, pid: null, bundleId, appName: app }
    sampler.session.samples = samples
    sampler.session.seq = samples.length
    sampler.session.startedAt = samples[0].t
    sampler.session.running = false
    sampler.session.error = null
    sampler.session.detail = null
    sampler.session.detailAt = 0
    sampler.session.marks = [{ t: samples[0].t, label: `真机录制 ${seconds}s`, seq: 1 }]

    return {
      ok: true,
      deviceName,
      bundleId,
      seconds,
      samples: samples.length,
      peakMB: bytesToMB(Math.max(...samples.map((sample) => sample.total))),
      lastMB: bytesToMB(samples[samples.length - 1].total),
      hint: '已载入面板时间轴（不是实时）。要类型级下钻需要 Allocations 模板，本版还没做。',
    }
  } finally {
    await rm(output, { recursive: true, force: true }).catch(() => {})
  }
}
