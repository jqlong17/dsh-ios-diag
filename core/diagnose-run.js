// core/diagnose-run.js · 一键诊断的执行层（面板 RPC 与工具共用）
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assessMemory } from './assess.js'
import { scanHealth } from './health-run.js'
import { physicalDevices, recordTrace } from './trace.js'
import { aggregateDiagnose, renderDiagnoseReport, buildDiagnoseHandoff } from './diagnose.js'
import { appendDiagnose } from './diagnose-store.js'

const ROOT = fileURLToPath(new URL('../', import.meta.url))

export async function runDiagnose(sampler, payload = {}) {
  // 项目路径必须由调用方给：不猜 cwd。
  const target = String(payload.target || '').trim()
  if (!target) throw new Error('请填写项目路径（代码健康扫描要指向具体仓库）')
  if (!target.startsWith('/')) throw new Error('项目路径要用绝对路径')
  const project = target.split('/').filter(Boolean).pop()

  let bundleId = String(payload.bundleId || (sampler.session.target && sampler.session.target.bundleId) || '')
  const running = await sampler.listTargets({}).catch(() => ({ devices: [] }))
  const apps = (running.devices || []).flatMap((device) => (device.apps || []).map((app) => ({ ...app, udid: device.udid })))
  const app = apps[0] || null
  if (!bundleId && app) bundleId = app.bundleId

  let check = null
  try {
    check = await sampler.preflight({ bundleId })
  } catch (error) {
    check = null
  }

  let health = null
  try {
    health = await scanHealth({ target, project })
  } catch (error) {
    health = null
  }

  const includeDevice = payload.includeDevice !== false
  let device = null
  try {
    const devices = await physicalDevices()
    device = devices.find((item) => item.online) || null
  } catch (error) {
    device = null
  }

  // 真机：勾了且有设备就录 10 秒，先录再采模拟器内存（录制会重置 session）。
  let deviceRecord = null
  if (includeDevice && device && app) {
    try {
      const recorded = await recordTrace(sampler, { bundleId: app.bundleId, seconds: Math.min(20, Number(payload.deviceSeconds) || 10) })
      deviceRecord = { peakMB: recorded.peakMB, lastMB: recorded.lastMB, samples: recorded.samples }
    } catch (error) {
      deviceRecord = null
    }
  }

  // 模拟器内存：没在采样就自动采一小段。
  let memory = null
  if (sampler.session.mode !== 'trace' && sampler.session.samples.length) {
    memory = assessMemory({ samples: sampler.session.samples, marks: sampler.session.marks })
  }
  if (!memory && app) {
    try {
      const sampleSeconds = Math.min(30, Math.max(8, Number(payload.sampleSeconds) || 12))
      await sampler.start({ udid: app.udid, bundleId: app.bundleId, pid: app.pid, appName: app.name, intervalMs: 500 })
      await new Promise((resolve) => setTimeout(resolve, sampleSeconds * 1000))
      sampler.stop()
      memory = assessMemory({ samples: sampler.session.samples, marks: sampler.session.marks })
    } catch (error) {
      memory = null
    }
  }

  const result = aggregateDiagnose({ check, health, memory, device: includeDevice ? device : null, deviceRecord, includeDevice })

  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const when = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
  const dir = join(ROOT, 'docs', 'measurements', project)
  await mkdir(dir, { recursive: true })
  const path = join(dir, `${stamp}-diagnose.md`)
  const reportPaths = {
    体检: check ? join(check.dir, 'report.md') : null,
    代码健康: health ? health.path : null,
  }
  const markdown = renderDiagnoseReport({
    project, when,
    device: device ? device.name : '模拟器',
    result, reportPaths, checks: check,
  })
  await writeFile(path, markdown)

  const handoff = buildDiagnoseHandoff({
    result, reportPath: path, project, checks: check,
    healthPath: reportPaths.代码健康, root: ROOT, when, target,
  })
  const record = {
    id: `diag-${stamp}`,
    at: now.toISOString(),
    project,
    target,
    device: device ? device.name : '模拟器',
    level: result.level,
    headline: result.headline,
    subline: result.subline,
    modules: result.modules,
    reportPath: path,
    healthPath: reportPaths.代码健康,
    checkPath: reportPaths.体检,
    handoff,
  }
  await appendDiagnose(record)
  return { ok: true, path, handoff, result, reportPaths, record }
}
