import { execFile } from 'node:child_process'
import { basename } from 'node:path'

// core/util.js · 无状态工具
//
// 依赖只有 node 内置模块；不 import 任何 core/*，保证是叶子层。
//
// 谁都能用，不持有 session、不 spawn 长任务。拆出来是为了让采样、trace、目标发现
// 三个模块共用同一套字节换算与 exec 封装，而不是各自复制一份。
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

export function alive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export function shortName(bundleId) {
  const parts = String(bundleId).split('.')
  return parts[parts.length - 1] || bundleId
}

export function categoriesOf(proc) {
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

export function topRows(map, limit) {
  const rows = []
  for (const [key, value] of map) rows.push({ name: key, bytes: value.bytes, regions: value.regions })
  rows.sort((a, b) => b.bytes - a.bytes)
  return rows.slice(0, limit)
}

/// 解析 `xctrace export` 出来的 sysmon-process 表（真机 Activity Monitor 模板）。
///
/// 表的行结构是「一堆自闭合/纯文本元素，按 schema 列顺序排列」，重复值用 `ref="<id>"` 指回
/// 前面出现过的元素。这里用两次扫描：先把 id→文本/fmt 建表，再逐行按顺序取值。
