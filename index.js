// dsh-ios-diag · 宿主侧入口：面板 RPC + DSH 原生工具
//
// 采样与聚合都在 core.js；这里只负责把同一个内核暴露成两条通道：
//   POST /dsh-ios-diag  —— 右侧栏面板用
//   ios_mem_* 工具     —— Agent 用（MCP 入口见 bin/mcp.mjs）
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { MemorySampler, MAX_BODY_BYTES, TOOL_SPECS, toolInputSchema } from './core.js'
import { listRuns, RUNS_DIR } from './core/runs.js'
import { generateReport } from './core/report-run.js'
import { CATALOG } from './core/catalog.js'
import { scanHealth } from './core/health-run.js'
import { assessHealth } from './core/health.js'
import { aggregateDiagnose, renderDiagnoseReport, buildDiagnoseHandoff } from './core/diagnose.js'
import { assessMemory } from './core/assess.js'
import { physicalDevices } from './core/trace.js'
import { appendDiagnose, listDiagnoses } from './core/diagnose-store.js'
import { writeFile, mkdir } from 'node:fs/promises'
import { parseCheckReport, buildCheckHandoff } from './core/handoff.js'
import { readFile } from 'node:fs/promises'

const ROOT = fileURLToPath(new URL('./', import.meta.url))
const ROUTE = '/dsh-ios-diag'
const VERSION = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version
const STARTED_AT = Date.now()
const LOG = '[dsh-ios-diag]'

const sampler = new MemorySampler()

export const name = 'dsh-ios-diag'

export function apply(ctx) {
  ctx.inject(['connection', 'webServer', 'tools'], (scoped) => {
    scoped.effect(() => registerRoute(scoped), 'dsh-ios-diag: route')
    scoped.effect(() => registerTools(scoped), 'dsh-ios-diag: tools')
  })
  ctx.effect(() => () => sampler.stop(), 'dsh-ios-diag: stop sampler on unload')
  console.log(`${LOG} 已加载（${process.platform}）`)
}

// ---------------------------------------------------------------- HTTP RPC

function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buffer.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('请求体过大'))
        req.destroy()
        return
      }
      chunks.push(buffer)
    })
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8').trim()
      if (!text) {
        resolve({})
        return
      }
      try {
        const parsed = JSON.parse(text)
        resolve(parsed && typeof parsed === 'object' ? parsed : {})
      } catch {
        reject(new Error('请求体不是 JSON'))
      }
    })
    req.on('error', reject)
  })
}

async function dispatch(op, payload) {
  switch (op) {
    case 'targets':
      return sampler.listTargets(payload)
    case 'start':
      return sampler.startFromPayload(payload)
    case 'stop':
      sampler.stop()
      return sampler.snapshot()
    case 'state':
      return sampler.snapshot(payload)
    case 'export':
      return sampler.exportRun(payload)
    case 'runs':
      return { runs: await listRuns({ limit: Math.min(50, Math.max(1, Number(payload.limit) || 20)) }) }
    case 'info':
      return { version: VERSION, startedAt: STARTED_AT, cwd: process.cwd() }
    case 'health': {
      const target = String(payload.target || process.cwd())
      const project = String(payload.project || target.split('/').filter(Boolean).pop() || 'repo')
      const result = await scanHealth({ target, project, arch: Boolean(payload.arch) })
      return { ...result, assessment: assessHealth(result) }
    }
    case 'catalog':
      return { modules: CATALOG }
    case 'preflight':
      return sampler.preflight(payload)
    case 'diagnoses':
      return { rows: await listDiagnoses({ limit: Math.min(50, Math.max(1, Number(payload.limit) || 20)) }) }
    case 'diagnose': {
      const bundleId = String(payload.bundleId || (sampler.session.target && sampler.session.target.bundleId) || '')
      const project = bundleId ? bundleId.split('.').pop() : String(process.cwd()).split('/').pop()
      let check = null
      let health = null
      try {
        check = await sampler.preflight({ bundleId })
      } catch (error) {
        check = null
      }
      try {
        health = await scanHealth({ target: String(payload.target || process.cwd()), project })
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
      const memory = sampler.session.samples.length
        ? assessMemory({ samples: sampler.session.samples, marks: sampler.session.marks })
        : null
      const result = aggregateDiagnose({ check, health, memory, device: includeDevice ? device : null, includeDevice })
      const now = new Date()
      const pad = (value) => String(value).padStart(2, '0')
      const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
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
        device: sampler.session.target ? sampler.session.target.deviceName : '模拟器',
        result, reportPaths, checks: check,
      })
      await writeFile(path, markdown)
      const handoff = buildDiagnoseHandoff({ result, reportPath: path, project, checks: check, healthPath: reportPaths.代码健康, root: ROOT })
      // 每按一次 = 一条不可改记录；Markdown 只是它的视图。
      const record = {
        id: `diag-${stamp}`,
        at: now.toISOString(),
        project,
        device: sampler.session.target ? sampler.session.target.deviceName : '模拟器',
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
    case 'reportNow': {
      const exported = await sampler.exportRun({ lastSeconds: 120 })
      return generateReport({ dir: exported.dir })
    }
    case 'report': {
      const runId = String(payload.runId || '').trim()
      const dir = payload.dir || (runId ? join(RUNS_DIR, runId) : '')
      if (!dir) throw new Error('缺少 runId 或 dir')
      // 体检 run 没有事件表，但它有自己的 report.md 和交接文本。
      try {
        await readFile(join(dir, 'events.jsonl'))
      } catch {
        const markdown = await readFile(join(dir, 'report.md'), 'utf8')
        const parsed = parseCheckReport(markdown)
        return {
          ok: true,
          kind: 'preflight',
          path: join(dir, 'report.md'),
          handoff: buildCheckHandoff({ ...parsed, reportPath: join(dir, 'report.md'), root: process.cwd() }),
        }
      }
      return generateReport({
        dir,
        project: payload.project ? String(payload.project) : undefined,
        title: String(payload.title || ''),
        slug: String(payload.slug || 'run'),
      })
    }
    case 'detail':
      return sampler.detail()
    case 'mark':
      return sampler.mark(payload)
    case 'clear':
      return sampler.clear()
    case 'launch':
      return sampler.launch(payload)
    default:
      throw new Error(`未知操作：${op}`)
  }
}

function registerRoute(scoped) {
  return scoped.webServer.register({
    kind: 'prefix',
    path: ROUTE,
    handler: async (req, res) => {
      try {
        const rejection = scoped.connection?.requestRejection?.(req)
        if (rejection !== undefined) {
          res.statusCode = typeof rejection === 'number' ? rejection : 403
          res.end()
          return
        }
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('allow', 'POST')
          res.end()
          return
        }
        const body = await readJsonBody(req)
        const op = typeof body.op === 'string' ? body.op : ''
        const payload = body.payload && typeof body.payload === 'object' ? body.payload : {}
        const value = await dispatch(op, payload)
        sendJson(res, 200, { ok: true, value })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        sendJson(res, 200, { ok: false, error: { code: 'dsh-ios-diag', message: message.slice(0, 600) } })
      }
    },
  })
}

// ---------------------------------------------------------------- 工具

function makeTool(spec) {
  return {
    name: spec.name,
    description: spec.description,
    parameters: toolInputSchema(spec),
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    execute: async (args) => spec.handler(sampler, args && typeof args === 'object' ? args : {}),
  }
}

function registerTools(scoped) {
  const disposers = TOOL_SPECS.map((spec) => scoped.tools.register(makeTool(spec)))
  return () => { for (const dispose of disposers) dispose() }
}
