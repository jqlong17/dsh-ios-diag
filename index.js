// dsh-ios-diag · 宿主侧入口：面板 RPC + DSH 原生工具
//
// 采样与聚合都在 core.js；这里只负责把同一个内核暴露成两条通道：
//   POST /dsh-ios-diag  —— 右侧栏面板用
//   ios_mem_* 工具     —— Agent 用（MCP 入口见 bin/mcp.mjs）
import { join } from 'node:path'
import { MemorySampler, MAX_BODY_BYTES, TOOL_SPECS, toolInputSchema } from './core.js'
import { listRuns, RUNS_DIR } from './core/runs.js'
import { generateReport } from './core/report-run.js'
import { CATALOG } from './core/catalog.js'
import { scanHealth } from './core/health-run.js'
import { assessHealth } from './core/health.js'

const ROUTE = '/dsh-ios-diag'
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
    case 'report': {
      const runId = String(payload.runId || '').trim()
      const dir = payload.dir || (runId ? join(RUNS_DIR, runId) : '')
      if (!dir) throw new Error('缺少 runId 或 dir')
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
