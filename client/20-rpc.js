// RPC + 纯工具：单位换算、时间格式、类别取值、「其他」倒推、降采样。

  // ------------------------------------------------------------ RPC

  function callRpc(op, payload) {
    return fetch(ROUTE, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: op, payload: payload || {} })
    }).then(function (response) {
      if (!response.ok) {
        return { ok: false, error: { message: "HTTP " + response.status } };
      }
      return response.json();
    }).then(function (body) {
      if (!body || typeof body !== "object") {
        return { ok: false, error: { message: "无效响应" } };
      }
      return body;
    }).catch(function (error) {
      return { ok: false, error: { message: error && error.message ? error.message : String(error) } };
    });
  }

  // ------------------------------------------------------------ 工具

  function mb(bytes) {
    return Math.round((Number(bytes) || 0) / 1048576 * 10) / 10;
  }

  function fmtMB(bytes) {
    var value = mb(bytes);
    return (value >= 100 ? Math.round(value) : value) + "MB";
  }

  function clock(ms) {
    var d = new Date(ms);
    return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  }

  function pad(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function catBytes(sample, name) {
    if (!sample || !sample.categories) return 0;
    for (var i = 0; i < sample.categories.length; i++) {
      if (sample.categories[i].name === name) return sample.categories[i].bytes;
    }
    return 0;
  }

  /// 「其他」= 总量 - 已单列的类别之和。
  /// 用总量倒推而不是「把剩下的类别加起来」：footprint 的分类偶尔不会刚好等于
  /// total（不同 Xcode 版本会漏掉 page table 之类的开销），倒推能保证堆叠顶边
  /// 和总量线重合，不会在图上方留一条看不见的缝。
  function otherBytes(sample, names) {
    var named = 0;
    var categories = sample.categories || [];
    for (var i = 0; i < categories.length; i++) {
      if (names.indexOf(categories[i].name) >= 0) named += categories[i].bytes;
    }
    return Math.max(0, (sample.total || 0) - named);
  }

  function topNames(sample, count) {
    if (!sample || !sample.categories) return [];
    return sample.categories.slice(0, count).map(function (row) { return row.name; });
  }

  function shortTime(sec) {
    if (sec >= 60 && sec % 60 === 0) return (sec / 60) + "m";
    return sec + "s";
  }

/// 超过 maxPoints 就按桶取「总量最大」的那个样本再画。
///
/// 为什么取峰值而不是平均：内存问题几乎都是尖峰（一次解码、一张大图），
/// 平均会把尖峰抹平，图上看不出来；取峰值等于保真。
function decimateSamples(samples, maxPoints) {
  if (samples.length <= maxPoints) return samples;
  var bucket = Math.ceil(samples.length / maxPoints);
  var out = [];
  for (var i = 0; i < samples.length; i += bucket) {
    var best = samples[i];
    for (var j = i + 1; j < Math.min(i + bucket, samples.length); j++) {
      if (samples[j].total > best.total) best = samples[j];
    }
    out.push(best);
  }
  return out;
}
