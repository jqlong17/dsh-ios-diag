// core/targets.js · 只读系统状态：模拟器列表、运行中的 App、启动 App
//
// 不持有采样状态；调用方传 tag 只是为了给临时文件一个唯一名。
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { exec, shortName } from './util.js'

export async function findRunningApp(udid, bundleId) {
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

export async function displayNames(udid, tag = "") {
  const names = new Map()
  try {
    const list = await exec('xcrun', ['simctl', 'listapps', udid], 15000)
    if (list.code !== 0) return names
    const file = join(tmpdir(), `dsh-ios-diag-apps-${tag}-${udid.slice(0, 8)}.plist`)
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

export async function listTargets(payload = {}, tag = "") {
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
    const names = await displayNames(device.udid, tag)
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

export async function launchApp(payload) {
  const udid = String(payload.udid || '').trim()
  const bundleId = String(payload.bundleId || '').trim()
  if (!udid || !bundleId) throw new Error('需要 udid 和 bundleId')
  const result = await exec('xcrun', ['simctl', 'launch', udid, bundleId], 20000)
  if (result.code !== 0) {
    throw new Error((result.stderr || '').trim().slice(0, 300) || '启动失败')
  }
  return { launched: true, output: (result.stdout || '').trim() }
}
