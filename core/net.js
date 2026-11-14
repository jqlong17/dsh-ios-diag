// core/net.js · pcap 解析（网络对象与链接）
//
// 抓包需要 BPF 权限（/dev/bpf0 只有 root 可读），但**解析不需要**：
// 拿一个现成的 pcap，用 tshark 的 fields 模式拆成对象即可。
// 这样权限没到位时也能先把「请求 / 响应 / WS 帧」接进统一事件表。
//
// 不用 -T json：一次抓包几万帧，JSON 会到几百 MB；fields 一行一帧，够用。
import { access } from 'node:fs/promises'
import { exec } from './util.js'
import { createEvent } from './events.js'

const FIELDS = [
  'frame.time_epoch',
  'tcp.stream',
  'http.request.method',
  'http.request.uri',
  'http.response.code',
  'websocket.opcode',
]

/// tshark fields 输出 → 事件 + 链接。纯函数，便于用固定文本测。
///
/// 关联规则：同一 TCP 流里，响应挂到最近一个请求上。stream 只能保证「同一条连接」，
/// 所以置信度 0.9 而不是 1——连接复用时会串到别的请求。
export function parseTsharkFields(text) {
  const events = []
  const links = []
  const lastRequest = new Map()
  let seq = 0

  for (const line of String(text || '').split('\n')) {
    if (!line.trim()) continue
    const [time, stream, method, uri, status, ws] = line.split('\t')
    const epoch = Number(time)
    if (!Number.isFinite(epoch)) continue
    const ts = new Date(epoch * 1000).toISOString()

    if (method) {
      const id = `req:${stream || '0'}:${++seq}`
      events.push(createEvent({
        ts,
        type: 'rpc_request',
        id,
        attrs: { method, uri: uri || '', stream: stream || '' },
      }))
      lastRequest.set(stream || '0', { id, ts })
      continue
    }
    if (status) {
      const id = `res:${stream || '0'}:${++seq}`
      const request = lastRequest.get(stream || '0')
      events.push(createEvent({
        ts,
        type: 'rpc_response',
        id,
        attrs: {
          status: Number(status),
          uri: uri || '',
          stream: stream || '',
          durationMs: request ? Math.max(0, Date.parse(ts) - Date.parse(request.ts)) : null,
        },
      }))
      if (request) {
        links.push({ from: request.id, type: 'answered_by', to: id, method: 'id', confidence: 0.9 })
      }
      continue
    }
    if (ws) {
      events.push(createEvent({
        ts,
        type: 'ws_frame',
        id: `ws:${stream || '0'}:${++seq}`,
        attrs: { opcode: Number(ws), stream: stream || '' },
      }))
    }
  }

  return { events, links }
}

export async function analyzePcap(payload = {}) {
  const path = String(payload.path || '').trim()
  if (!path) throw new Error('需要 pcap 路径')
  try {
    await access(path)
  } catch {
    throw new Error(`读不到文件：${path}`)
  }

  const args = ['-r', path, '-o', 'ip.check_checksum:FALSE', '-o', 'tcp.check_checksum:FALSE',
    '-T', 'fields']
  for (const field of FIELDS) args.push('-e', field)
  args.push('-E', 'separator=\t')

  const result = await exec('tshark', args, 120000)
  if (result.code !== 0) {
    throw new Error((result.stderr || '').trim().slice(-300) || `tshark 退出码 ${result.code}`)
  }

  const { events, links } = parseTsharkFields(result.stdout)
  const counts = {}
  for (const event of events) counts[event.type] = (counts[event.type] || 0) + 1

  return {
    ok: true,
    path,
    counts,
    events: events.slice(-100),
    links: links.slice(-100),
    hint: '链接 method=id 表示同一 TCP 流，confidence 0.9；HTTPS 只能看到握手与长度。',
  }
}
