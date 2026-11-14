// core/allocations.js · 真机 Allocations 类型下钻
//
// 走的是和实时采样完全不同的路径：xctrace 的 Allocations 模板录制一段，
// 导出轨迹里 Allocations → Statistics 表，按分配类型聚合 live bytes。
//
// 为什么单独一个模块：它只服务于「真机、录制、快照」这一种场景，
// 和 core/sampler.js 的实时采样环没有共享状态，混在一起只会让两边都难读。
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { clamp, exec } from './util.js'
import { waitForOnlineDevices } from './trace.js'

const MEMBER_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }

/// xctrace 导出的类别名里有 XML 实体（`_DictionaryStorage&lt;…&gt;`），
/// 不解码的话排行里会露出 `&lt;`，也没法和 Instruments 界面对照。
export function decodeEntities(text) {
  return String(text).replace(/&(amp|lt|gt|quot|#39);/g, (_all, key) => MEMBER_ENTITIES[key])
}

function attribute(attrs, name) {
  const match = new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)
  return match ? match[1] : ''
}

/// 解析 Allocations → Statistics 表。
///
/// 表的行是自闭合 `<row …/>`，指标全在属性里（与 sysmon 的「列顺序 + ref」不同）。
/// 取 `persistent-bytes`（录制结束时仍存活）而不是 total：类型排行关心的是「现在占着多少」。
export function parseAllocationStatistics(xml, limit = 40) {
  const rows = []
  const rowRe = /<row\s([^>]*?)\/>/g
  let match
  while ((match = rowRe.exec(xml))) {
    const attrs = match[1]
    const category = attribute(attrs, 'category')
    if (!category) continue
    // "All Heap & Anonymous VM" / "All Heap Allocations" 是汇总行，不是类型。
    if (category.startsWith('All ')) continue
    // VM 预留只是地址空间（JavaScriptCore 一上来就 reserve 2GB），不是物理占用；
    // 混进排行会把「谁在吃内存」直接带偏，单独统计。
    if (/reservation/i.test(category)) continue
    const liveBytes = Number(attribute(attrs, 'persistent-bytes'))
    if (!Number.isFinite(liveBytes) || liveBytes <= 0) continue
    const totalBytes = Number(attribute(attrs, 'total-bytes')) || 0
    rows.push({
      category: decodeEntities(category),
      liveBytes,
      liveMB: Math.round(liveBytes / 1048576 * 10) / 10,
      liveCount: Number(attribute(attrs, 'count-persistent')) || 0,
      totalBytes,
      totalMB: Math.round(totalBytes / 1048576 * 10) / 10,
      totalCount: Number(attribute(attrs, 'count-total')) || 0,
    })
  }
  rows.sort((a, b) => b.liveBytes - a.liveBytes)
  return rows.slice(0, clamp(Number(limit) || 40, 1, 200))
}

/// 汇总口径分开给：
/// - heap：All Heap Allocations（App 自己的堆）
/// - total：All Heap & Anonymous VM（含匿名 VM，历史口径）
/// - reserved：被排除的 VM 预留总和（地址空间，不是物理占用）
export function parseAllocationSummary(xml) {
  const bytesOf = (pattern) => {
    const match = pattern.exec(xml)
    if (!match) return null
    const value = Number(match[1])
    return Number.isFinite(value) ? value : null
  }
  const heap = bytesOf(/<row\s[^>]*category="All Heap Allocations"[^>]*persistent-bytes="(\d+)"/)
  const total = bytesOf(/<row\s[^>]*category="All Heap &amp; Anonymous VM"[^>]*persistent-bytes="(\d+)"/)
  let reserved = 0
  const reservationRe = /<row\s([^>]*)\/>/g
  let match
  while ((match = reservationRe.exec(xml))) {
    const category = attribute(match[1], 'category')
    if (!/reservation/i.test(category)) continue
    reserved += Number(attribute(match[1], 'persistent-bytes')) || 0
  }
  return { heap, total, reserved }
}

/// 录一段并解析。真机 attach 不了，所以只有「录制回放」这一条路。
export async function recordAllocations(sampler, payload = {}) {
  const bundleId = String(payload.bundleId || '').trim()
  if (!bundleId) throw new Error('需要 bundleId（真机上 App 的标识）')
  const seconds = clamp(Number(payload.seconds) || 10, 3, 120)
  const limit = clamp(Number(payload.limit) || 20, 1, 100)

  let udid = String(payload.udid || '').trim()
  let deviceName = ''
  const devices = await waitForOnlineDevices()
  const online = devices.filter((item) => item.online)
  if (!udid) {
    if (!online.length) {
      const offline = devices.filter((item) => !item.online)
      throw new Error(offline.length
        ? `检测到 ${offline.length} 台真机但 xctrace 视为离线（${offline.map((item) => item.name).join('、')}）：需要 USB 连接并保持解锁`
        : '没有检测到已连接的真机：用 USB 连接、解锁并信任这台电脑')
    }
    udid = online[0].udid
    deviceName = online[0].name
  } else {
    const found = devices.find((item) => item.udid === udid)
    if (found) {
      if (!found.online) throw new Error(`${found.name} 当前离线：需要 USB 连接并保持解锁`)
      deviceName = found.name
    }
  }

  const output = join(tmpdir(), `dsh-ios-diag-alloc-${sampler.tag}.trace`)
  await rm(output, { recursive: true, force: true })
  try {
    const record = await exec('xcrun', [
      'xctrace', 'record', '--device', udid, '--template', 'Allocations',
      '--time-limit', `${seconds}s`, '--no-prompt', '--output', output, '--launch', bundleId,
    ], (seconds + 90) * 1000)
    if (record.code !== 0) {
      throw new Error((record.stderr || '').trim().slice(-400) || `xctrace record 退出码 ${record.code}`)
    }
    const exported = await exec('xctrace', [
      'export', '--input', output,
      '--xpath', '/trace-toc/run[@number="1"]/tracks/track[@name="Allocations"]/details/detail[@name="Statistics"]',
    ], 120000)
    if (exported.code !== 0) {
      throw new Error((exported.stderr || '').trim().slice(-400) || 'xctrace export 失败')
    }

    const types = parseAllocationStatistics(exported.stdout, limit)
    if (!types.length) throw new Error('trace 里没有分配统计（模板或 Statistics 表名可能随 Xcode 版本变了）')
    const summary = parseAllocationSummary(exported.stdout)
    const toMB = (bytes) => (bytes === null ? null : Math.round(bytes / 1048576 * 10) / 10)

    return {
      ok: true,
      deviceName,
      bundleId,
      seconds,
      heapMB: toMB(summary.heap),
      // 匿名 VM 去掉预留下的部分；total 本身含 2GB 预留，直接给会把人吓到。
      anonymousVMMB: summary.total === null
        ? null
        : toMB(Math.max(0, summary.total - (summary.heap || 0) - summary.reserved)),
      reservedMB: toMB(summary.reserved),
      types,
      hint: 'persistent = 录制结束时仍存活，不等于泄漏；类型之和小于总量是正常的（含未归类/共享部分）。',
    }
  } finally {
    await rm(output, { recursive: true, force: true }).catch(() => {})
  }
}
