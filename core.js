// dsh-ios-diag · 共享内核入口
//
// 具体实现在 core/ 下按职责拆分（util / trace / targets / sampler / tools），
// 这里只做 re-export，保证 index.js、bin/mcp.mjs、测试三处 import 不用改。
//
// 采样数据源与限制见 README；拆分动机见 spec/2026-11-14-1510-architecture-split.md。
export * from './core/util.js'
export * from './core/trace.js'
export * from './core/targets.js'
export * from './core/sampler.js'
export * from './core/tools.js'
