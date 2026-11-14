#!/usr/bin/env node
// dsh-ios-mem · MCP server（stdio）
//
// 给 DSH 之外的 MCP 客户端用：Claude Code、Cursor、Codex，或另一个 harness。
// 协议是 newline-delimited JSON-RPC 2.0，只实现 tools/* 这一层，不引入 SDK。
//
//   { "command": "node", "args": ["<此文件>"] }
//
// stdout 只走 JSON-RPC，日志一律写 stderr。
import { MemorySampler, TOOL_SPECS, toolInputSchema } from '../core.js'

const NAME = 'dsh-ios-mem'
const VERSION = '0.1.0'
const DEFAULT_PROTOCOL = '2024-11-05'
const KNOWN_PROTOCOLS = new Set(['2024-11-05', '2025-03-26', '2025-06-18'])
const LOG = '[dsh-ios-mem-mcp]'

const sampler = new MemorySampler()
let closed = false
let buffer = ''

function send(message) {
  if (closed) return
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

function reply(id, result) {
  send({ jsonrpc: '2.0', id, result })
}

function fail(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } })
}

const handlers = {
  initialize(params) {
    const requested = params && typeof params.protocolVersion === 'string' ? params.protocolVersion : ''
    return {
      protocolVersion: KNOWN_PROTOCOLS.has(requested) ? requested : DEFAULT_PROTOCOL,
      capabilities: { tools: {} },
      serverInfo: { name: NAME, version: VERSION },
      instructions: [
        'iOS 模拟器内存采样。先 ios_mem_targets 找 udid + bundleId（或 pid），再 ios_mem_start；',
        'ios_mem_status 看趋势，ios_mem_detail 看当前是谁在吃内存，ios_mem_mark 打点，ios_mem_stop 停止。',
        '只支持模拟器：真机进程无法被宿主 attach。采样会每秒 fork 一次 footprint，不用时请 stop。',
      ].join(''),
    }
  },

  ping() {
    return {}
  },

  'tools/list'() {
    return {
      tools: TOOL_SPECS.map((spec) => ({
        name: spec.name,
        description: spec.description,
        inputSchema: toolInputSchema(spec),
      })),
    }
  },

  async 'tools/call'(params) {
    const name = params && typeof params.name === 'string' ? params.name : ''
    const spec = TOOL_SPECS.find((item) => item.name === name)
    if (!spec) throw new Error(`Unknown tool: ${name}`)
    const args = params.arguments && typeof params.arguments === 'object' ? params.arguments : {}
    try {
      const value = await spec.handler(sampler, args)
      return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { content: [{ type: 'text', text: `error: ${message}` }], isError: true }
    }
  },
}

async function handle(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) return
  const method = message.method
  if (typeof method !== 'string') return
  const id = message.id

  // 通知（没有 id）：initialized / cancelled 都不需要回包。
  if (id === undefined || id === null) return

  const handler = handlers[method]
  if (!handler) {
    fail(id, -32601, `Method not found: ${method}`)
    return
  }
  try {
    reply(id, await handler(message.params || {}))
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error)
    fail(id, -32603, text)
  }
}

function drain() {
  for (;;) {
    const newline = buffer.indexOf('\n')
    if (newline < 0) return
    const line = buffer.slice(0, newline).trim()
    buffer = buffer.slice(newline + 1)
    if (!line) continue
    let message
    try {
      message = JSON.parse(line)
    } catch {
      continue
    }
    void handle(message)
  }
}

function shutdown() {
  if (closed) return
  closed = true
  sampler.stop()
  process.exit(0)
}

process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buffer += chunk
  drain()
})
process.stdin.on('end', shutdown)
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

console.error(`${LOG} ready（stdio，${TOOL_SPECS.length} 个工具）`)
