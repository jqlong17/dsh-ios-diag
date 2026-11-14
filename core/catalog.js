// core/catalog.js · 判据编号字典
//
// 规则：一位字母是模块，点分层级：A → A.1 → A.1.3。
// 编号只增不改：改了编号，历史报告里的引用就对不上了。
// 面板的「编号」页和报告里的 [A.1.3] 都读这一份，避免两套说法。

export const CATALOG = [
  {
    id: 'A', title: '内存', summary: '占用规模、趋势、归因',
    items: [
      { id: 'A.1', title: '规模', items: [
        { id: 'A.1.1', title: '当前占用', note: 'footprint；jetsam 看的就是它' },
        { id: 'A.1.2', title: '窗口峰值', note: '一次操作最多冲到多少' },
        { id: 'A.1.3', title: '舒适区', note: '>150MB 留意，>400MB 偏高' },
      ] },
      { id: 'A.2', title: '趋势', items: [
        { id: 'A.2.1', title: '持续上涨', note: '整窗斜率 >5MB/分钟，像泄漏' },
        { id: 'A.2.2', title: '阶梯上涨', note: '涨完就平：一次性渲染成本' },
        { id: 'A.2.3', title: '平稳', note: '波动 ≤8%，没有单向趋势' },
        { id: 'A.2.4', title: '窗口不足', note: '<6 秒或 <5 点，不下结论' },
      ] },
      { id: 'A.3', title: '归因', items: [
        { id: 'A.3.1', title: '按用途', note: 'region tag：Malloc / CoreAnimation / __DATA' },
        { id: 'A.3.2', title: '按模块', note: '加载镜像：自己的 App / SwiftUI / UIKit' },
        { id: 'A.3.3', title: '按类型', note: '真机 Allocations：谁分配得最多' },
      ] },
      { id: 'A.4', title: '判据', items: [
        { id: 'A.4.1', title: '重复操作', note: '同一操作 2–3 次，每次都不回落才算泄漏' },
        { id: 'A.4.2', title: '启动爬坡', note: '头几个点 <10MB，算趋势前剔除' },
      ] },
    ],
  },
  {
    id: 'B', title: '日志', summary: '错误、超时、崩溃',
    items: [
      { id: 'B.1', title: '错误条数', note: '窗口内 error/fault 的条数' },
      { id: 'B.2', title: '超时与重试', note: '请求超时、重连风暴' },
      { id: 'B.3', title: '崩溃与前缀', note: 'DiagnosticReports / .ips' },
    ],
  },
  {
    id: 'C', title: '网络', summary: '请求、响应、重连',
    items: [
      { id: 'C.1', title: '请求/响应配对', note: 'rpcId 对得上才叫一次往返' },
      { id: 'C.2', title: '超时', note: '超过客户端阈值的请求' },
      { id: 'C.3', title: '重连', note: '断线重连的次数与间隔' },
    ],
  },
  {
    id: 'D', title: '体检', summary: '装真机前的六项',
    items: [
      { id: 'D.1', title: '进程在跑', note: 'launchctl 能找到 bundle' },
      { id: 'D.2', title: '构建类型', note: 'Debug 的数字不代表真机' },
      { id: 'D.3', title: '内存', note: '<200MB' },
      { id: 'D.4', title: '日志错误', note: '窗口内错误 ≤5 条' },
      { id: 'D.5', title: '近期崩溃', note: '近 7 天 .ips' },
      { id: 'D.6', title: '数据容器', note: '<200MB' },
    ],
  },
  {
    id: 'E', title: '报告交接', summary: '结论、证据、给谁看',
    items: [
      { id: 'E.1', title: '结论', note: '一句话判断，放在报告第一段' },
      { id: 'E.2', title: '证据', note: '数据表 + 打点对齐' },
      { id: 'E.3', title: '交接', note: '绝对路径 + 怎么继续测' },
    ],
  },
  {
    id: 'F', title: '设备采集', summary: '真机怎么采',
    items: [
      { id: 'F.1', title: '连接方式', note: 'USB 稳定；网络会抖' },
      { id: 'F.2', title: '内存录制', note: 'Activity Monitor，1Hz 回放' },
      { id: 'F.3', title: '类型下钻', note: 'Allocations 统计' },
      { id: 'F.4', title: '日志', note: 'Logging 模板录 os_log' },
    ],
  },
]

/// 拍平成 [{id,title,note,module}]，供面板与报告引用。
export function catalogFlat() {
  const out = []
  for (const module of CATALOG) {
    out.push({ id: module.id, title: module.title, note: module.summary, module: module.id })
    for (const group of module.items || []) {
      out.push({ id: group.id, title: group.title, note: group.note || '', module: module.id })
      for (const item of group.items || []) {
        out.push({ id: item.id, title: item.title, note: item.note || '', module: module.id })
      }
    }
  }
  return out
}

export function catalogFind(id) {
  return catalogFlat().find((entry) => entry.id === id) || null
}
