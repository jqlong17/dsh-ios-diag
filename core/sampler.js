// core/sampler.js · 采样状态机
//
// 唯一有状态的东西：采样环、打点、明细缓存、汇总。所有系统调用都委托给
// targets.js（列表/启动）与 trace.js（真机录制），这里只做编排。
import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  FOOTPRINT, MAX_SAMPLES, RETENTION_MS, DETAIL_TTL_MS,
  clamp, bytesToMB, exec, alive, categoriesOf, splitRegion, topRows,
} from './util.js'
import { listTargets, findRunningApp, launchApp } from './targets.js'
import { physicalDevices, recordTrace } from './trace.js'

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

  async startFromPayload(payload) {
    let { udid, bundleId, pid, intervalMs } = payload
    pid = Number(pid) || undefined
    let deviceName = ''
    let appName = ''
    if (!udid || !pid) {
      const { devices } = await listTargets({ includeSystem: true }, this.tag)
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

  // ------------------------------------------------------------ 真机（实现见 core/trace.js）

  /// 工具与 RPC 都走这里；tag 用于给 listapps 的临时文件起唯一名。
  listTargets(payload = {}) {
    return listTargets(payload, this.tag)
  }

  physicalDevices() {
    return physicalDevices()
  }

  recordTrace(payload = {}) {
    return recordTrace(this, payload)
  }

  launch(payload) {
    return launchApp(payload)
  }
}
