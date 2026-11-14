// dsh-ios-mem · 共享内核
//
// 采样、聚合、工具定义都放在这里，两个入口复用同一份实现：
//   index.js     —— DSH 插件（HTTP RPC + 原生工具）
//   bin/mcp.mjs  —— MCP server（stdio），给 Claude Code / Cursor 这类客户端
//
// 数据源是 Xcode 的 footprint：
//   footprint -j <file> <pid>      ~40ms，总量 + 30 个 VM 类别
//   footprint -v -j <file> <pid>   ~90ms，5000+ region 的 tag / 镜像 / 字节
// 两者都不需要 task_for_pid，所以模拟器里的 App 可直接采；真机进程采不了。
import { execFile } from 'node:child_process'
import { readFile, writeFile, rm } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

export const FOOTPRINT = '/usr/bin/footprint'
/// 保留窗口按**时间**算，不按点数：间隔改成 500ms 时，30 分钟仍然是 30 分钟。
export const RETENTION_MS = 30 * 60 * 1000
export const MAX_SAMPLES = 7200          // 250ms 间隔下 30 分钟的上限，兜底用
export const DETAIL_TTL_MS = 4000
export const MAX_BODY_BYTES = 256 * 1024

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function bytesToMB(value) {
  return Math.round((Number(value) || 0) / 1048576 * 10) / 10
}

export function exec(file, args, timeout = 15000) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout, maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
      let code = 0
      if (error) code = Number.isInteger(error.code) ? error.code : -1
      resolve({ code, stdout: String(stdout || ''), stderr: String(stderr || '') })
    })
  })
}

function alive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function shortName(bundleId) {
  const parts = String(bundleId).split('.')
  return parts[parts.length - 1] || bundleId
}

function categoriesOf(proc) {
  const rows = []
  const source = proc && proc.categories && typeof proc.categories === 'object' ? proc.categories : {}
  for (const [name, value] of Object.entries(source)) {
    const bytes = Number(value && value.dirty) || 0
    if (!bytes) continue
    rows.push({ name, bytes, regions: Number(value && value.regions) || 0 })
  }
  rows.sort((a, b) => b.bytes - a.bytes)
  return rows
}

/// region 名有两种形状：`__TEXT /path/to/binary`（带镜像路径）和 `Malloc Tiny` / `CoreAnimation`（没有路径）。
/// 带路径的归到「镜像」维度；没有路径的整串当标签、不进镜像维度——否则镜像榜会被 Malloc 类别淹掉。
export function splitRegion(name) {
  const text = String(name || '').trim()
  if (!text) return { tag: 'Unknown', image: null }
  const space = text.indexOf(' ')
  if (space < 0) return { tag: text, image: null }
  const head = text.slice(0, space)
  const rest = text.slice(space + 1)
  if (!rest.startsWith('/')) return { tag: text, image: null }
  return { tag: head, image: basename(rest) }
}

function topRows(map, limit) {
  const rows = []
  for (const [key, value] of map) rows.push({ name: key, bytes: value.bytes, regions: value.regions })
  rows.sort((a, b) => b.bytes - a.bytes)
  return rows.slice(0, limit)
}

/// 解析 `xctrace export` 出来的 sysmon-process 表（真机 Activity Monitor 模板）。
///
/// 表的行结构是「一堆自闭合/纯文本元素，按 schema 列顺序排列」，重复值用 `ref="<id>"` 指回
/// 前面出现过的元素。这里用两次扫描：先把 id→文本/fmt 建表，再逐行按顺序取值。
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

export class MemorySampler {
  constructor() {
    this.tag = `${process.pid}-${randomBytes(3).toString('hex')}`
    this.session = {
      target: null,       // { udid, deviceName, pid, bundleId, appName }
      running: false,
      intervalMs: 1000,
      startedAt: 0,
      seq: 0,
      samples: [],
      marks: [],
      error: null,
      detail: null,
      detailAt: 0,
      lastAt: 0,
      mode: 'live',
    }
    this.generation = 0
    this.timer = null
    this.reviveFailures = 0
  }

  // ------------------------------------------------------------ 采样

  sampleFile() {
    return join(tmpdir(), `dsh-ios-mem-sample-${this.tag}.json`)
  }

  detailFile() {
    return join(tmpdir(), `dsh-ios-mem-detail-${this.tag}.json`)
  }

  async capture(pid, verbose) {
    const file = verbose ? this.detailFile() : this.sampleFile()
    const args = verbose ? ['-v', '-j', file, String(pid)] : ['-j', file, String(pid)]
    const result = await exec(FOOTPRINT, args)
    if (result.code !== 0) {
      const reason = (result.stderr || '').trim().split('\n').filter(Boolean).pop()
      throw new Error(reason || `footprint 退出码 ${result.code}`)
    }
    return JSON.parse(await readFile(file, 'utf8'))
  }

  /// 丢掉 30 分钟以前的样本；再兜一次点数上限（极短间隔时防止无限长）。
  trimSamples(now) {
    const cutoff = now - RETENTION_MS
    const samples = this.session.samples
    let drop = 0
    while (drop < samples.length - 1 && samples[drop].t < cutoff) drop += 1
    if (drop > 0) samples.splice(0, drop)
    if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES)
  }

  async sampleOnce() {
    const target = this.session.target
    if (!target) return
    try {
      const raw = await this.capture(target.pid, false)
      const proc = (raw.processes || [])[0]
      if (!proc) throw new Error('footprint 没有返回进程数据')
      const sample = {
        seq: ++this.session.seq,
        t: Date.now(),
        total: Number(proc.footprint) || 0,
        // peak 与 categories.regions 只在明细里用，样本里不存：7200 点时这是 2MB 的差别。
        categories: categoriesOf(proc).map((row) => ({ name: row.name, bytes: row.bytes })),
      }
      this.session.samples.push(sample)
      this.trimSamples(sample.t)
      this.session.lastAt = sample.t
      this.session.error = null
      this.reviveFailures = 0
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!alive(target.pid)) {
        // 压测时场景是「终止 → 重新 launch」，pid 每次都会变。
        // 同一个 bundle 又跑起来了就自动接上，否则等几次再放弃。
        const next = await this.findRunningApp(target.udid, target.bundleId)
        if (next && next.pid !== target.pid) {
          this.revive(next.pid)
          this.reviveFailures = 0
          return
        }
        this.reviveFailures += 1
        if (this.reviveFailures >= 3) {
          this.session.error = `进程 ${target.pid} 已退出，采样停止`
          this.stop()
        } else {
          this.session.error = `进程 ${target.pid} 已退出，等待同一个 App 重新启动…`
        }
      } else {
        this.session.error = `采样失败：${message.slice(0, 200)}`
      }
    }
  }

  /// 只查一个 bundle 在不在跑（比 listTargets 便宜：不列 App、不读展示名）。
  async findRunningApp(udid, bundleId) {
    if (!udid || !bundleId) return null
    const lc = await exec('xcrun', ['simctl', 'spawn', udid, 'launchctl', 'list'], 10000)
    if (lc.code !== 0) return null
    for (const line of lc.stdout.split('\n')) {
      const match = line.match(/^(\d+)\s+\S+\s+UIKitApplication:([^\[]+)\[([^\]]+)\]/)
      if (!match || match[2] !== bundleId) continue
      const pid = Number(match[1])
      if (pid > 0) return { pid }
    }
    return null
  }

  /// 接上新进程：这是新的一轮采样（面板靠 startedAt 变化清掉旧曲线）。
  revive(pid) {
    const target = this.session.target
    if (!target) return
    this.session.target = { ...target, pid }
    this.session.startedAt = Date.now()
    this.session.seq = 0
    this.session.samples = []
    this.session.marks = [{ t: Date.now(), label: `App 重新启动 → pid ${pid}`, seq: 0 }]
    this.session.error = null
    this.session.detail = null
    this.session.detailAt = 0
    this.session.lastAt = 0
  }

  async tick(gen) {
    if (gen !== this.generation) return
    const started = Date.now()
    await this.sampleOnce()
    if (gen !== this.generation || !this.session.running) return
    const wait = Math.max(200, this.session.intervalMs - (Date.now() - started))
    this.timer = setTimeout(() => { void this.tick(gen) }, wait)
    if (this.timer && typeof this.timer.unref === 'function') this.timer.unref()
  }

  start(payload) {
    const udid = String(payload.udid || '').trim()
    const bundleId = String(payload.bundleId || '').trim()
    const pid = Number(payload.pid)
    if (!udid) throw new Error('缺少 udid：先调用 ios_mem_targets')
    if (!Number.isInteger(pid) || pid <= 0) throw new Error('缺少有效的 pid')
    const intervalMs = clamp(Number(payload.intervalMs) || 1000, 250, 10000)

    this.stop()
    this.session.target = {
      udid,
      deviceName: String(payload.deviceName || ''),
      pid,
      bundleId,
      appName: String(payload.appName || (bundleId ? bundleId.split('.').pop() : `pid ${pid}`)),
    }
    this.session.running = true
    this.session.intervalMs = intervalMs
    this.session.startedAt = Date.now()
    this.session.seq = 0
    this.session.samples = []
    this.session.marks = []
    this.session.error = null
    this.session.mode = 'live'
    this.session.detail = null
    this.session.detailAt = 0
    this.reviveFailures = 0
    this.generation += 1
    void this.tick(this.generation)
    return this.snapshot()
  }

  stop() {
    this.generation += 1
    this.session.running = false
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  clear() {
    this.session.samples = []
    this.session.marks = []
    this.session.seq = 0
    this.session.startedAt = Date.now()
    return this.snapshot()
  }

  // ------------------------------------------------------------ 目标发现

  async displayNames(udid) {
    const names = new Map()
    try {
      const list = await exec('xcrun', ['simctl', 'listapps', udid], 15000)
      if (list.code !== 0) return names
      const file = join(tmpdir(), `dsh-ios-mem-apps-${this.tag}-${udid.slice(0, 8)}.plist`)
      await writeFile(file, list.stdout)
      const json = await exec('plutil', ['-convert', 'json', '-o', '-', file], 10000)
      if (json.code !== 0) return names
      const parsed = JSON.parse(json.stdout)
      for (const [bundleId, info] of Object.entries(parsed || {})) {
        const label = info && (info.CFBundleDisplayName || info.CFBundleName)
        if (typeof label === 'string' && label.trim()) names.set(bundleId, label.trim())
      }
    } catch {
      /* 拿不到展示名就退回 bundle id 末段 */
    }
    return names
  }

  async listTargets(payload = {}) {
    const includeSystem = payload.includeSystem === true
    const result = await exec('xcrun', ['simctl', 'list', 'devices', '--json'])
    if (result.code !== 0) {
      throw new Error(`xcrun simctl 不可用：${(result.stderr || '').trim().slice(0, 200)}`)
    }
    let parsed
    try {
      parsed = JSON.parse(result.stdout)
    } catch {
      throw new Error('simctl 返回的不是 JSON')
    }
    const devices = []
    for (const [runtime, list] of Object.entries(parsed.devices || {})) {
      for (const device of Array.isArray(list) ? list : []) {
        if (device.state !== 'Booted') continue
        devices.push({
          udid: device.udid,
          name: device.name,
          runtime: String(runtime).replace(/^com\.apple\.CoreSimulator\.SimRuntime\./, '').replace(/-/g, ' '),
          apps: [],
        })
      }
    }
    for (const device of devices) {
      const lc = await exec('xcrun', ['simctl', 'spawn', device.udid, 'launchctl', 'list'], 10000)
      if (lc.code !== 0) continue
      const names = await this.displayNames(device.udid)
      for (const line of lc.stdout.split('\n')) {
        const match = line.match(/^(\d+)\s+\S+\s+UIKitApplication:([^\[]+)\[([^\]]+)\]/)
        if (!match) continue
        const pid = Number(match[1])
        const bundleId = match[2]
        if (!pid) continue
        // 系统 App（日历、Spotlight、Widget 渲染进程）对内存调试没意义，默认不列。
        if (!includeSystem && bundleId.startsWith('com.apple.')) continue
        device.apps.push({ bundleId, pid, name: names.get(bundleId) || shortName(bundleId) })
      }
      device.apps.sort((a, b) => a.name.localeCompare(b.name))
    }
    return { devices: devices.filter((device) => device.apps.length > 0) }
  }

  /// 面板与工具共用的起点：udid + bundleId、或 pid 单独给，都能落到一个具体进程。
  async startFromPayload(payload) {
    let { udid, bundleId, pid, intervalMs } = payload
    pid = Number(pid) || undefined
    let deviceName = ''
    let appName = ''
    if (!udid || !pid) {
      const { devices } = await this.listTargets({ includeSystem: true })
      let device = udid ? devices.find((item) => item.udid === udid) : undefined
      let app
      if (pid) {
        const owner = device || devices.find((item) => item.apps.some((row) => row.pid === pid))
        if (owner) {
          device = owner
          app = owner.apps.find((row) => row.pid === pid)
        }
      } else if (device && bundleId) {
        app = device.apps.find((row) => row.bundleId === bundleId)
      }
      if (device) {
        udid = udid || device.udid
        deviceName = device.name
      }
      if (app) {
        pid = app.pid
        bundleId = bundleId || app.bundleId
        appName = app.name
      }
    }
    if (!udid) throw new Error('找不到这个进程所在的模拟器；请同时传 udid')
    return this.start({ udid, bundleId, pid, deviceName, appName, intervalMs })
  }

  async launch(payload) {
    const udid = String(payload.udid || '').trim()
    const bundleId = String(payload.bundleId || '').trim()
    if (!udid || !bundleId) throw new Error('需要 udid 和 bundleId')
    const result = await exec('xcrun', ['simctl', 'launch', udid, bundleId], 20000)
    if (result.code !== 0) {
      throw new Error((result.stderr || '').trim().slice(0, 300) || '启动失败')
    }
    return { launched: true, output: (result.stdout || '').trim() }
  }

  // ------------------------------------------------------------ 真机录制

  /// 已连接的真机（xctrace 的 Devices 段；跳过 Mac 本身）。
  async physicalDevices() {
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
      if (section !== 'Devices') continue
      const text = line.trim()
      if (!text || /MacBook|Mac mini|Mac Studio|iMac|Mac Pro/i.test(text)) continue
      const match = text.match(/\(([0-9A-Fa-f]{8}-[0-9A-Fa-f]{16})\)\s*$/)
      if (!match) continue
      devices.push({ udid: match[1], name: text.split(' (')[0] })
    }
    return devices
  }

  /// 真机录一段：Activity Monitor 模板 → 导出 sysmon-process → 载入时间轴。
  /// 真机进程 attach 不了，所以这里只能「录制回放」，不是实时采样。
  async recordTrace(payload = {}) {
    const bundleId = String(payload.bundleId || '').trim()
    if (!bundleId) throw new Error('需要 bundleId（真机上 App 的标识）')
    const seconds = clamp(Number(payload.seconds) || 10, 3, 120)
    let udid = String(payload.udid || '').trim()
    let deviceName = ''
    const devices = await this.physicalDevices()
    if (!udid) {
      if (!devices.length) throw new Error('没有检测到已连接的真机：解锁手机并信任这台电脑')
      udid = devices[0].udid
      deviceName = devices[0].name
    } else {
      const found = devices.find((item) => item.udid === udid)
      if (found) deviceName = found.name
    }

    const output = join(tmpdir(), `dsh-ios-mem-${this.tag}.trace`)
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

      this.stop()
      this.session.mode = 'trace'
      this.session.target = { udid, deviceName, pid: null, bundleId, appName: app }
      this.session.samples = samples
      this.session.seq = samples.length
      this.session.startedAt = samples[0].t
      this.session.running = false
      this.session.error = null
      this.session.detail = null
      this.session.detailAt = 0
      this.session.marks = [{ t: samples[0].t, label: `真机录制 ${seconds}s`, seq: 1 }]

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

  // ------------------------------------------------------------ 明细下钻

  async detail() {
    if (!this.session.target) throw new Error('还没有选中采样目标')
    const now = Date.now()
    if (this.session.detail && now - this.session.detailAt < DETAIL_TTL_MS) return this.session.detail
    const raw = await this.capture(this.session.target.pid, true)
    const proc = (raw.processes || [])[0]
    if (!proc) throw new Error('footprint 没有返回进程数据')
    const regions = Array.isArray(proc.regions) ? proc.regions : []
    const tags = new Map()
    const images = new Map()
    let tagTotal = 0
    let imageTotal = 0
    const add = (map, key, bytes) => {
      const row = map.get(key) || { bytes: 0, regions: 0 }
      row.bytes += bytes
      row.regions += 1
      map.set(key, row)
    }
    for (const region of regions) {
      const bytes = (Number(region.dirty) || 0) + (Number(region.swapped) || 0)
      if (!bytes) continue
      const { tag, image } = splitRegion(region.name)
      add(tags, tag, bytes)
      tagTotal += bytes
      if (image) {
        add(images, image, bytes)
        imageTotal += bytes
      }
    }
    this.session.detail = {
      at: Date.now(),
      total: Number(proc.footprint) || 0,
      regions: regions.length,
      tags: topRows(tags, 40),
      tagsTotal: tagTotal,
      images: topRows(images, 40),
      imagesTotal: imageTotal,
    }
    this.session.detailAt = this.session.detail.at
    return this.session.detail
  }

  // ------------------------------------------------------------ 汇总

  summarize(windowSec) {
    const now = Date.now()
    const from = now - Math.max(1, Number(windowSec) || 60) * 1000
    const samples = this.session.samples.filter((s) => s.t >= from)
    if (!samples.length) return null
    const totals = samples.map((s) => s.total)
    const first = samples[0]
    const last = samples[samples.length - 1]
    const peak = Math.max(...totals)
    const low = Math.min(...totals)
    const avg = totals.reduce((sum, value) => sum + value, 0) / totals.length
    const minutes = Math.max(1 / 60, (last.t - first.t) / 60000)
    return {
      windowSec: Math.round((last.t - first.t) / 1000),
      samples: samples.length,
      currentMB: bytesToMB(last.total),
      peakMB: bytesToMB(peak),
      minMB: bytesToMB(low),
      avgMB: bytesToMB(avg),
      deltaMB: bytesToMB(last.total - first.total),
      perMinuteMB: Math.round((last.total - first.total) / 1048576 / minutes * 10) / 10,
    }
  }

  snapshot(payload = {}) {
    const since = Math.max(0, Number(payload.since) || 0)
    const limit = clamp(Number(payload.limit) || MAX_SAMPLES, 1, MAX_SAMPLES)
    let samples = this.session.samples
    if (since > 0) samples = samples.filter((s) => s.seq > since)
    if (samples.length > limit) samples = samples.slice(-limit)
    return {
      running: this.session.running,
      target: this.session.target,
      intervalMs: this.session.intervalMs,
      startedAt: this.session.startedAt,
      seq: this.session.seq,
      samples,
      marks: this.session.marks.slice(-50),
      error: this.session.error,
      mode: this.session.mode,
      summary: this.summarize(60),
      detailAt: this.session.detailAt,
      now: Date.now(),
    }
  }

  mark(payload) {
    const label = String(payload.label || '').trim().slice(0, 60)
    if (!label) throw new Error('打点需要 label')
    const mark = { t: Date.now(), label, seq: this.session.seq }
    this.session.marks.push(mark)
    if (this.session.marks.length > 200) this.session.marks.shift()
    return { mark, marks: this.session.marks.length }
  }

  statusReport(windowSec) {
    const summary = this.summarize(windowSec || 60)
    const samples = this.session.samples
    const last = samples[samples.length - 1]
    const top = last ? last.categories.slice(0, 6).map((row) => ({
      name: row.name,
      MB: bytesToMB(row.bytes),
      percent: Math.round(row.bytes / Math.max(1, last.total) * 1000) / 10,
    })) : []
    return {
      ok: true,
      running: this.session.running,
      target: this.session.target,
      intervalMs: this.session.intervalMs,
      error: this.session.error,
      samples: samples.length,
      marks: this.session.marks.slice(-10),
      summary,
      topCategories: top,
      hint: this.session.mode === 'trace'
        ? '这是导入的真机录制，不是实时。类别/镜像下钻需要 Allocations 模板，本版没做。'
        : this.session.running
          ? '面板里可直接看时间轴；要看某个时刻的结构，调 ios_mem_detail。'
          : '还没在采样：先 ios_mem_targets 找 pid，再 ios_mem_start。',
    }
  }
}

// ------------------------------------------------------------ 工具定义（两个入口共用）
//
// handler 返回纯 JSON；DSH 直接渲染成文本，MCP 包成 content[type=text]。

export const TOOL_SPECS = [
  {
    name: 'ios_mem_targets',
    description: '列出已启动的 iOS 模拟器，以及每个模拟器里正在运行的 App（bundleId + pid）。做内存采样前先用它选目标。',
    properties: {},
    async handler(sampler) {
      const targets = await sampler.listTargets({})
      return {
        ok: true,
        devices: targets.devices.map((device) => ({
          udid: device.udid,
          name: device.name,
          runtime: device.runtime,
          apps: device.apps.map((app) => ({ bundleId: app.bundleId, name: app.name, pid: app.pid })),
        })),
        hint: '把 udid + bundleId（或 pid）传给 ios_mem_start 开始采样。',
      }
    },
  },
  {
    name: 'ios_mem_start',
    description: '开始对模拟器里的某个 App 采样内存：默认每 1000ms 一次 footprint，保留最近 30 分钟（按时间裁，改间隔也还是 30 分钟）。传 udid + bundleId 会自动找 pid。',
    properties: {
      udid: { type: 'string', description: '模拟器 udid（来自 ios_mem_targets）。' },
      bundleId: { type: 'string', description: 'App 的 bundle id；不传则必须传 pid。' },
      pid: { type: 'integer', description: '直接指定进程 pid。' },
      intervalMs: { type: 'integer', description: '采样间隔毫秒，250–10000，默认 1000。' },
    },
    async handler(sampler, args) {
      await sampler.startFromPayload(args)
      return { ok: true, ...sampler.statusReport(10), hint: '采样已开始。需要标注某个操作，用 ios_mem_mark。' }
    },
  },
  {
    name: 'ios_mem_stop',
    description: '停止当前内存采样，保留已采到的样本。',
    properties: {},
    async handler(sampler) {
      sampler.stop()
      return { ok: true, ...sampler.statusReport(60), hint: '已停止；样本还在内存里，重新开始会清空。' }
    },
  },
  {
    name: 'ios_mem_status',
    description: '看当前采样状态：最近窗口的当前/峰值/均值/增量、涨速、以及此刻占比最高的 VM 类别。不开采样也能看上次的状态。',
    properties: {
      windowSec: { type: 'integer', description: '统计窗口秒数，默认 60。' },
    },
    async handler(sampler, args) {
      return sampler.statusReport(args.windowSec || 60)
    },
  },
  {
    name: 'ios_mem_mark',
    description: '在时间轴上打一个标记（例如「进入会话」「发送消息」），面板会画一条竖线。打点后最好记下时间，方便和事件对齐。',
    properties: {
      label: { type: 'string', description: '标记文字，最多 60 字。' },
    },
    async handler(sampler, args) {
      const result = sampler.mark(args)
      return { ok: true, ...result, hint: '已打点。' }
    },
  },
  {
    name: 'ios_mem_detail',
    description: '当前时刻的结构明细：按加载镜像（DSHPocket / SwiftUI / UIKitCore…）和按区域标签（__TEXT / Malloc Small / CoreAnimation…）各给前 20 名，单位 MB。用于回答「到底是谁在吃内存」。',
    properties: {
      limit: { type: 'integer', description: '每个维度返回多少行，默认 20，最大 40。' },
    },
    async handler(sampler, args) {
      const detail = await sampler.detail()
      const limit = clamp(Number(args.limit) || 20, 1, 40)
      return {
        ok: true,
        at: new Date(detail.at).toISOString(),
        totalMB: bytesToMB(detail.total),
        regions: detail.regions,
        imagesTotalMB: bytesToMB(detail.imagesTotal),
        images: detail.images.slice(0, limit).map((row) => ({
          name: row.name,
          MB: bytesToMB(row.bytes),
          percent: Math.round(row.bytes / Math.max(1, detail.imagesTotal) * 1000) / 10,
        })),
        tagsTotalMB: bytesToMB(detail.tagsTotal),
        tags: detail.tags.slice(0, limit).map((row) => ({
          name: row.name,
          MB: bytesToMB(row.bytes),
          regions: row.regions,
          percent: Math.round(row.bytes / Math.max(1, detail.tagsTotal) * 1000) / 10,
        })),
        hint: '镜像只统计带二进制路径的 region（代码/常量段）；堆内存没有路径，看 tags 或类别。',
      }
    },
  },
  {
    name: 'ios_mem_record',
    description: '在已连接的真机上录一段内存（Activity Monitor 模板，约 1Hz），录完直接载入面板时间轴。不需要改 App；真机进程无法 attach，所以这是录制回放而不是实时。',
    properties: {
      bundleId: { type: 'string', description: '真机上 App 的 bundle id，例如 com.ruska.dsh-pocket-ios。' },
      seconds: { type: 'integer', description: '录制秒数，3–120，默认 10。' },
      udid: { type: 'string', description: '设备 udid；不传则用第一台已连接的真机。' },
    },
    async handler(sampler, args) {
      return sampler.recordTrace(args)
    },
  },
  {
    name: 'ios_mem_launch',
    description: '在指定模拟器里启动一个 App（simctl launch），方便先起 App 再采样。',
    properties: {
      udid: { type: 'string', description: '模拟器 udid。' },
      bundleId: { type: 'string', description: 'App 的 bundle id。' },
    },
    async handler(sampler, args) {
      return { ok: true, ...(await sampler.launch(args)) }
    },
  },
]

/// 工具参数 → JSON Schema（MCP 与 DSH 都用同一份）。
export function toolInputSchema(spec) {
  return {
    type: 'object',
    properties: spec.properties || {},
    additionalProperties: false,
  }
}
