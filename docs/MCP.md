# MCP server

给 DSH 之外的 MCP 客户端用：Claude Code、Cursor、Codex、其他 harness。工具与 DSH 插件里的那 7 个完全一致，因为两边共用 `core.js`。

## 为什么不直接给 DSH

DSH 里的插件已经注册了 7 个原生工具（`ios_mem_*`），Agent 现在就能调。再给 DSH 挂一份 MCP，只会得到 7 个重名工具和第二个采样进程，没有收益。MCP 是为**别的客户端**准备的。

## 接入

stdio 传输，命令行直接跑：

```json
{
  "mcpServers": {
    "ios-mem": {
      "command": "node",
      "args": ["/Users/ruska/projects/dsh-plugins/dsh-ios-diag/bin/mcp.mjs"]
    }
  }
}
```

- Claude Code：`claude mcp add ios-mem -- node /Users/ruska/projects/dsh-plugins/dsh-ios-diag/bin/mcp.mjs`
- Claude Desktop：写进 `claude_desktop_config.json` 的 `mcpServers`
- Cursor：写进 `.cursor/mcp.json` 或全局 MCP 配置

node 需要 22+。

## 工具

| 工具 | 作用 |
| --- | --- |
| `ios_mem_targets` | 列出已启动模拟器与其中运行的 App（udid / bundleId / pid） |
| `ios_mem_start` | 开始采样；可只给 udid + bundleId，自动找 pid |
| `ios_mem_status` | 当前/峰值/均值/增量、涨速、top 类别 |
| `ios_mem_detail` | 当前时刻按镜像、按区域标签的排行 |
| `ios_mem_mark` | 时间轴打点 |
| `ios_mem_stop` | 停止采样 |
| `ios_mem_launch` | 在模拟器里启动 App |
| `ios_mem_record` | 真机录一段（Activity Monitor，约 1Hz），载入时间轴 |
| `ios_mem_types` | 真机录一段 Allocations，按类型排行 live bytes |

## 协议实现范围

只实现 MCP 的 `tools` 层：

- `initialize`（回显客户端协议版本，支持 2024-11-05 / 2025-03-26 / 2025-06-18）
- `notifications/initialized`（忽略）
- `ping`
- `tools/list`
- `tools/call`

没有 resources、prompts、sampling、roots。stdout 只走 JSON-RPC，日志写 stderr。

工具执行失败时返回 `isError: true` 的文本结果（让模型看到原因），未知工具返回 JSON-RPC `-32603`。

## 注意

- **每个 MCP 客户端各跑一个采样进程**，状态在各自进程里。DSH 面板和 MCP 同时开，就是每秒两次 `footprint`。不用时 `stop`。
- 只支持模拟器；真机进程没有 `task_for_pid`。
- 样本按时间保留最近 30 分钟（与采样间隔无关，上限 7200 点），进程退出即清空。
