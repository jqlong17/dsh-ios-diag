// core/assess.js · 把测量翻译成「结论 + 依据 + 下一步」
//
// 面板和报告里最缺的不是数字，是判断：60MB 算好还是坏？平的说明什么？
// 这里用固定规则给出结论，并明确写出「测不出结论」的情况——不知道比假装知道好。
//
// 规则（阈值写进 UI 的「判断依据」，不藏着）：
//   - 采样 < 10 秒或 < 5 个点：结论「难判断」，因为趋势不可靠
//   - 窗口峰值 > 400MB：偏高
//   - 线性涨幅 > 5MB/分钟：像泄漏
//   - 涨幅 > 1MB/分钟：留意
//   - 否则：平稳；没有打点时额外说明「静置平稳不代表交互没问题」

export const THRESHOLDS = {
  minSamples: 5,
  minSeconds: 6,
  highMB: 400,
  watchMB: 150,
  leakPerMinute: 5,
  watchPerMinute: 1,
  flatRatio: 0.08,
}

export function assessMemory({ samples = [], marks = [], windowSec = 0, device = 'simulator' } = {}) {
  let points = samples
    .filter((sample) => sample && Number.isFinite(sample.total))
    .map((sample) => ({ t: Number(sample.t) || 0, mb: sample.total / 1048576 }))

  // 真机录制的头几个点通常是启动爬坡（0.1MB → 40MB），留着会把斜率算成「泄漏」。
  if (points.length > 3 && points[0].mb < 10) {
    const afterRamp = points.filter((point) => point.mb >= 10)
    if (afterRamp.length >= 3) points = afterRamp
  }
  const count = points.length
  const spanSec = count > 1 ? Math.max(0, (points[count - 1].t - points[0].t) / 1000) : 0

  if (count < THRESHOLDS.minSamples || spanSec < THRESHOLDS.minSeconds) {
    return {
      level: 'inconclusive',
      ruleId: 'A.2.4',
      headline: '还看不出结论',
      reasons: [`只采到 ${count} 个点、${Math.round(spanSec)} 秒，趋势不可靠（至少要 6 秒 5 个点）。`],
      next: ['先点「开始」，做你要测的操作，隔 10–30 秒再看。'],
      stats: null,
    }
  }

  const values = points.map((point) => point.mb)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const last = values[values.length - 1]
  const avg = values.reduce((sum, value) => sum + value, 0) / count
  // 最小二乘斜率（MB/分钟）
  function slopeOf(list) {
    const n = list.length
    if (n < 2) return 0
    const t0 = list[0].t
    const xs = list.map((point) => (point.t - t0) / 60000)
    const ys = list.map((point) => point.mb)
    const xMean = xs.reduce((sum, x) => sum + x, 0) / n
    const yMean = ys.reduce((sum, y) => sum + y, 0) / n
    let num = 0
    let den = 0
    for (let i = 0; i < n; i += 1) {
      num += (xs[i] - xMean) * (ys[i] - yMean)
      den += (xs[i] - xMean) ** 2
    }
    return den > 0 ? num / den : 0
  }
  const slope = slopeOf(points)
  // 最近 15 秒的斜率：区分「一次性阶梯」和「持续上涨」。
  const lastT = points[count - 1].t
  const recent = points.filter((point) => point.t >= lastT - 15000)
  const recentSlope = slopeOf(recent)
  const stats = {
    samples: count,
    spanSec: Math.round(spanSec),
    currentMB: Math.round(last * 10) / 10,
    minMB: Math.round(min * 10) / 10,
    maxMB: Math.round(max * 10) / 10,
    avgMB: Math.round(avg * 10) / 10,
    slopePerMinute: Math.round(slope * 10) / 10,
    recentSlopePerMinute: Math.round(recentSlope * 10) / 10,
    marks: marks.length,
  }

  const reasons = []
  const next = []

  if (max >= THRESHOLDS.highMB) {
    reasons.push(`峰值 ${stats.maxMB}MB，超过 ${THRESHOLDS.highMB}MB。`)
    next.push('先按类型看谁占得最多（内存 → 按类型），再对那个操作打点复测。')
    return { level: 'bad', ruleId: 'A.1.3', headline: `内存偏高：峰值 ${stats.maxMB}MB`, reasons, next, stats }
  }

  if (slope >= THRESHOLDS.leakPerMinute && recentSlope < THRESHOLDS.watchPerMinute) {
    reasons.push(`窗口内从 ${stats.minMB} 涨到 ${stats.maxMB}MB，但最近 15 秒已经平了。`)
    reasons.push('这是一次性上涨（比如一次渲染很重的内容），不是持续泄漏。')
    next.push('把同一个操作重复 2–3 次：每次都涨、都不回落，才算泄漏。')
    return { level: 'watch', ruleId: 'A.2.2', headline: '一次性上涨，之后平稳', reasons, next, stats }
  }

  if (slope >= THRESHOLDS.leakPerMinute && spanSec < 20) {
    reasons.push(`按趋势算每分钟涨 ${stats.slopePerMinute}MB，但窗口只有 ${stats.spanSec} 秒。`)
    reasons.push('App 启动/首次加载也会这样涨，先别下泄漏结论。')
    next.push('录 30 秒以上、或在同一个操作上重复几次，再判断是不是只增不减。')
    return { level: 'watch', ruleId: 'A.2.4', headline: '涨得快，但窗口太短', reasons, next, stats }
  }

  if (slope >= THRESHOLDS.leakPerMinute) {
    reasons.push(`按趋势算每分钟涨 ${stats.slopePerMinute}MB，像是只增不减。`)
    reasons.push(`窗口内 ${stats.minMB} → ${stats.maxMB}MB。`)
    next.push('重复同一个操作 3–5 次，看内存是否每次都不回落（这是泄漏的判据）。')
    next.push('对比最近一次报告：如果同一场景持续变高，把两次报告一起发给开发。')
    return { level: 'bad', ruleId: 'A.2.1', headline: `可能的内存泄漏：每分钟 +${stats.slopePerMinute}MB`, reasons, next, stats }
  }

  if (slope >= THRESHOLDS.watchPerMinute || max >= THRESHOLDS.watchMB) {
    reasons.push(slope >= THRESHOLDS.watchPerMinute
      ? `每分钟涨 ${stats.slopePerMinute}MB，不快但没停。`
      : `峰值 ${stats.maxMB}MB，超过 ${THRESHOLDS.watchMB}MB 的舒适区。`)
    reasons.push(`当前 ${stats.currentMB}MB，窗口内 ${stats.minMB}–${stats.maxMB}MB。`)
    next.push('再做一个更重的操作（滚动长列表、打开图片），看会不会继续涨。')
    return { level: 'watch', ruleId: 'A.2.1', headline: '值得留意：在涨，但还不算异常', reasons, next, stats }
  }

  const spread = max - min
  const flat = spread <= Math.max(2, avg * THRESHOLDS.flatRatio)
  reasons.push(`全程 ${stats.minMB}–${stats.maxMB}MB，波动 ${Math.round(spread * 10) / 10}MB。`)
  if (flat) reasons.push('没有持续上涨，也没有回落异常。')
  if (marks.length) {
    reasons.push(`打了 ${marks.length} 个点，能对上你做的操作。`)
  } else {
    reasons.push('没有打点：这是静置或连续操作的总量。')
    next.push('做一次具体操作（进入会话、发消息）后点「打点」，才能把变化归因到操作。')
  }
  next.push('换一个更重的场景再测一次（滚动长列表、连续发消息），静置平稳不代表交互没有问题。')
  return {
    level: 'ok',
    ruleId: 'A.2.3',
    headline: marks.length ? '这个场景没有内存问题' : '静置平稳，没有泄漏迹象',
    reasons,
    next,
    stats,
  }
}
