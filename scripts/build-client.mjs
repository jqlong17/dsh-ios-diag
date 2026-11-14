// 把 client/*.js 按文件名顺序拼进 loader 外壳，生成 client.js。
//
// 为什么是拼接而不是打包：DSH 的 Web 侧只执行
// `window.__ModuleLoader__.load({ id, factory })` 这种 classic script，
// factory 里不能出现 import；各段共享同一函数作用域，顺序拼接就够了。
// 引入 esbuild 这类 bundler 的维护成本高于收益（见 spec 的被否决方案）。
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sourceDir = join(root, 'client')

const files = (await readdir(sourceDir)).filter((name) => name.endsWith('.js')).sort()
if (!files.length) throw new Error('client/ 下没有源文件')

const parts = await Promise.all(files.map((name) => readFile(join(sourceDir, name), 'utf8')))
const body = parts
  .join('\n')
  .split('\n')
  .map((line) => (line.trim() ? `    ${line}` : line))
  .join('\n')

const artifact = `// 此文件由 scripts/build-client.mjs 生成，不要直接改。
// 改 client/*.js 后运行：npm run build:client
window.__ModuleLoader__.load({
  id: "dsh-ios-mem",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require("react");
    var e = React.createElement;
    var useState = React.useState;
    var useEffect = React.useEffect;
    var useMemo = React.useMemo;
    var useRef = React.useRef;

${body}

    module.exports = { apply: apply, inject: inject, __test: { Panel: Panel, Timeline: Timeline, Rows: Rows } };
    return module.exports;
  }
});
`

await writeFile(join(root, 'client.js'), artifact)
console.log(`[build-client] ${files.length} 段 -> client.js（${artifact.length} 字符）`)
