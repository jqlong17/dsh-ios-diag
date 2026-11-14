// 此文件由 scripts/build-client.mjs 生成，不要直接改。
// 改 client/*.js 后运行：npm run build:client
window.__ModuleLoader__.load({
  id: "dsh-ios-diag",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require("react");
    var e = React.createElement;
    var useState = React.useState;
    var useEffect = React.useEffect;
    var useMemo = React.useMemo;
    var useRef = React.useRef;

    // 常量与主题：色板、窗口、采样间隔。

      var NS = "dsh-ios-diag";
      var PANEL_ID = "dsh-ios-diag";
      var TAB_KIND = "ios-mem";
      var ROUTE = "/dsh-ios-diag";

      var FG = "var(--dsw-alias-label-primary, inherit)";
      var FG2 = "var(--dsw-alias-label-secondary, #6b7280)";
      var FG3 = "var(--dsw-alias-label-tertiary, #9aa0aa)";
      var BG1 = "var(--dsw-alias-bg-layer-1, transparent)";
      var BG2 = "var(--dsw-alias-bg-layer-2, rgba(120,120,128,.10))";
      var BORDER = "var(--dsw-alias-border-l1, rgba(0,0,0,.10))";
      var ACCENT = "var(--dsw-alias-state-business-primary, #4a63e7)";
      var DANGER = "var(--dsw-alias-state-error-primary, #d92d20)";
      var WARN = "var(--dsw-alias-state-warn-primary, #b54708)";
      var MONO = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';

      var COLORS = ["#4a63e7", "#1f9d63", "#d98b1f", "#b54708", "#8b5cf6", "#0891b2", "#9aa0aa"];
      var WINDOWS = [60, 300, 900, 1800];
      var MAX_POINTS = 7200;      // 服务端兜底上限；实际按 30 分钟时间窗裁
      var MAX_DRAWN = 480;        // 超过就按桶取峰值再画，避免 3600 个点拖慢渲染
      var INTERVALS = [500, 1000, 2000, 5000];

    // 文案（zh/en）。新增 key 必须两边都加，否则英文界面会露出中文。

      var zh = {
        "tab.title": "诊断",
        "guide.title": "iOS 内存",
        "guide.description": "模拟器内存实时趋势：时间轴 + 类别/镜像/区域下钻",
        "panel.status.idle": "未采样",
        "panel.status.trace": "已导入真机录制",
        "panel.status.running": "采样中",
        "panel.target": "目标",
        "panel.refresh": "刷新",
        "panel.start": "开始",
        "panel.stop": "停止",
        "panel.mark": "打点",
          "panel.export": "导出",
          "panel.runs": "记录",
          "panel.makeReport": "报告",
          "panel.working": "处理中…",
          "panel.runs.empty": "还没有导出过记录",
        "panel.markPlaceholder": "标记文字，回车保存",
        "panel.interval": "间隔",
        "panel.window": "窗口",
        "panel.current": "当前",
        "panel.peak": "峰值",
        "panel.delta": "变化",
        "panel.samples": "样本",
        "panel.category": "按类型",
        "panel.image": "按模块",
        "panel.tag": "按系统区域",
        "panel.detailNow": "明细为当前时刻，不是选中样本",
        "panel.imageNote": "只统计带二进制路径的 region",
        "panel.loading": "读取明细…",
        "panel.empty.title": "还没有样本",
        "panel.empty.body": "① 在模拟器里打开 App  ② 选目标  ③ 点「开始」  ④ 做你要测的操作，顺手「打点」",
        "panel.noTargets": "没有检测到正在运行的模拟器 App",
        "panel.noTargetsBody": "启动模拟器并打开 App，然后点刷新。真机进程无法被宿主 attach，这里只支持模拟器。",
        "panel.filterOn": "只看",
        "panel.clear": "返回全部",
        "panel.other": "其他",
        "panel.error": "采样错误",
        "panel.needTarget": "先选一个目标",
        "panel.marks": "打点",
        "panel.footer.sim": "单位 MB · footprint（jetsam 看的就是它） · 保留最近 30 分钟",
        "panel.noDetail": "还没有明细：先开始采样",
        "panel.close": "关闭",
        "panel.hover.total": "总计",
        "panel.hover.none": "把鼠标移到曲线上，能看到那一秒是谁在占内存",
          "panel.view.overview": "概览",
          "panel.view.memory": "内存",
          "panel.view.records": "记录",
          "panel.view.catalog": "编号",
          "panel.catalog.title": "判据编号",
          "panel.catalog.note": "报告里引用 [A.1.3] 这样的编号，都在这里查。",
          "panel.preflight.title": "装真机前体检",
          "panel.preflight.run": "跑一次体检",
          "panel.preflight.running": "体检中…",
          "panel.preflight.empty": "还没跑过：先在模拟器里打开 App，再点上面按钮。",
          "panel.preflight.report": "体检报告",
          "panel.overview.empty": "还没有采样。去「内存」选目标、点开始，回来这里看结论。",
          "panel.records.title": "历史记录",
          "panel.records.empty": "还没有导出过。采样后点「导出」就会出现在这里。",
          "panel.records.open": "报告",
          "panel.records.points": "个点",
          "panel.assess.next": "下一步",
          "panel.handoff.copied": "已复制提示词：粘贴给 Agent，它会读上面的报告接着分析",
          "panel.handoff.copy": "再复制一次",
          "panel.handoff.failed": "没能自动复制，点按钮复制",
          "panel.hint.category": "点一行 → 上面的图只显示这一类",
          "panel.hint.dim": "这里是当前时刻的明细，不是历史某一秒",
          "panel.verdict.ok": "正常",
          "panel.verdict.watch": "留意",
          "panel.verdict.high": "内存偏高（>400MB）",
          "panel.verdict.rising": "最近在涨",
      };

      var en = {
        "tab.title": "Diagnostics",
        "guide.title": "iOS memory",
        "guide.description": "Live simulator memory trend with category / image / region drill-down",
        "panel.status.idle": "idle",
        "panel.status.trace": "device trace loaded",
        "panel.status.running": "sampling",
        "panel.target": "Target",
        "panel.refresh": "Refresh",
        "panel.start": "Start",
        "panel.stop": "Stop",
        "panel.mark": "Mark",
          "panel.export": "Export",
          "panel.runs": "Records",
          "panel.makeReport": "Report",
          "panel.working": "working…",
          "panel.runs.empty": "No exports yet",
        "panel.markPlaceholder": "Label, press Enter",
        "panel.interval": "Every",
        "panel.window": "Window",
        "panel.current": "Now",
        "panel.peak": "Peak",
        "panel.delta": "Delta",
        "panel.samples": "Samples",
        "panel.category": "By kind",
        "panel.image": "By module",
        "panel.tag": "By region",
        "panel.detailNow": "Detail is for right now, not the selected sample",
        "panel.imageNote": "Path-backed regions only",
        "panel.loading": "Loading detail…",
        "panel.empty.title": "No samples yet",
        "panel.empty.body": "① Open the app in a simulator  ② Pick a target  ③ Press Start  ④ Do the action, and tap Mark",
        "panel.noTargets": "No running simulator app found",
        "panel.noTargetsBody": "Boot a simulator and open the app, then refresh. Physical-device processes cannot be attached from the host.",
        "panel.filterOn": "Only",
        "panel.clear": "Show all",
        "panel.other": "Other",
        "panel.error": "Sampling error",
        "panel.needTarget": "Pick a target first",
        "panel.marks": "Marks",
        "panel.footer.sim": "MB · footprint (the number jetsam watches) · keeps the last 30 minutes",
        "panel.noDetail": "No detail yet: start sampling first",
        "panel.close": "Close",
        "panel.hover.total": "total",
        "panel.hover.none": "Hover the curve to inspect one second",
          "panel.view.overview": "Overview",
          "panel.view.memory": "Memory",
          "panel.view.records": "Records",
          "panel.view.catalog": "Index",
          "panel.catalog.title": "Criterion index",
          "panel.catalog.note": "Reports cite ids like [A.1.3]; look them up here.",
          "panel.preflight.title": "Pre-device check",
          "panel.preflight.run": "Run check",
          "panel.preflight.running": "checking…",
          "panel.preflight.empty": "Not run yet: open the app in a simulator, then press the button.",
          "panel.preflight.report": "Check report",
          "panel.overview.empty": "No samples yet. Go to Memory, pick a target and press Start.",
          "panel.records.title": "History",
          "panel.records.empty": "Nothing exported yet. Export after sampling and it appears here.",
          "panel.records.open": "Report",
          "panel.records.points": "points",
          "panel.assess.next": "下一步",
          "panel.assess.next": "Next",
          "panel.handoff.copied": "Prompt copied: paste it to an agent, it will read the report",
          "panel.handoff.copy": "Copy again",
          "panel.handoff.failed": "Auto-copy failed, press to copy",
          "panel.hint.category": "Click a row to isolate it in the chart",
          "panel.hint.dim": "This is the current snapshot, not a past second",
          "panel.verdict.ok": "normal",
          "panel.verdict.watch": "watch",
          "panel.verdict.high": "High memory (>400MB)",
          "panel.verdict.rising": "Rising lately",
      };

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

    // 图表与列表：Timeline（堆叠面积 + 十字线）与 Rows（带条的排行）。

      // ------------------------------------------------------------ 图

      function Timeline(props) {
        var samples = props.samples;
        var marks = props.marks || [];
        var filter = props.filter;
        var hover = props.hover;
        var onHover = props.onHover;
        var pickedSeq = props.pickedSeq;
        var onPick = props.onPick;
        var t = props.t;

        var W = 320;
        var H = 152;
        var L = 36;
        var R = 8;
        var T = 10;
        var B = 20;
        var plotW = W - L - R;
        var plotH = H - T - B;

        var model = useMemo(function () {
          if (!samples.length) return null;
          // 30 分钟窗口在 1s 间隔下有 1800 个点；直接画 6 层堆叠会让 SVG 路径膨胀十几倍。
          var rows = samples.length > MAX_DRAWN ? decimateSamples(samples, MAX_DRAWN) : samples;
          var names = filter ? [filter] : topNames(rows[rows.length - 1], 5);
          var series = filter
            ? [{ name: filter, label: filter, color: COLORS[0], key: filter }]
            : names.map(function (name, index) {
              return { name: name, label: name, color: COLORS[index % COLORS.length], key: name };
            }).concat([{ name: "__other__", label: t("panel.other"), color: COLORS[6], key: "__other__" }]);

          var first = rows[0].t;
          var last = rows[rows.length - 1].t;
          var span = Math.max(1, last - first);
          var maxTotal = 0;
          var points = rows.map(function (sample) {
            var x = rows.length === 1 ? L : L + (sample.t - first) / span * plotW;
            var cum = 0;
            var bands = series.map(function (item) {
              var value = item.key === "__other__" ? otherBytes(sample, names) : catBytes(sample, item.name);
              var top = cum + value;
              var band = { item: item, top: top, bottom: cum };
              cum = top;
              return band;
            });
            if (cum > maxTotal) maxTotal = cum;
            return { sample: sample, x: x, bands: bands, total: cum };
          });
          var yMax = Math.max(4 * 1048576, maxTotal * 1.06);
          return { series: series, points: points, yMax: yMax, first: first, last: last };
        }, [samples, filter]);

        if (!model) {
          return e("div", { style: { padding: "18px 12px", color: FG3, fontSize: 11, textAlign: "center", border: "1px dashed " + BORDER, borderRadius: 10 } }, t("panel.empty.title"));
        }

        var y = function (bytes) { return T + plotH - (bytes / model.yMax) * plotH; };
        var indexAt = function (ev) {
          var svg = ev.currentTarget.ownerSVGElement;
          if (!svg) return 0;
          var rect = svg.getBoundingClientRect();
          if (!rect.width) return 0;
          var x = (ev.clientX - rect.left) / rect.width * W;
          var best = 0;
          var bestDistance = Infinity;
          for (var i = 0; i < model.points.length; i++) {
            var distance = Math.abs(model.points[i].x - x);
            if (distance < bestDistance) { bestDistance = distance; best = i; }
          }
          return best;
        };

        var children = [];
        children.push(e("rect", { key: "bg", x: 0, y: 0, width: W, height: H, rx: 10, fill: BG2 }));

        [0, 0.5, 1].forEach(function (level, index) {
          var lineY = T + plotH * (1 - level);
          var label = String(Math.round(model.yMax * level / 1048576));
          children.push(e("line", { key: "grid" + index, x1: L, y1: lineY, x2: W - R, y2: lineY, stroke: BORDER, strokeWidth: 1 }));
          children.push(e("text", {
            key: "gridlabel" + index, x: L - 5, y: lineY + 3, textAnchor: "end",
            fontSize: 8, fill: FG3, fontFamily: MONO
          }, level === 1 ? label + "MB" : label));
        });

        model.series.forEach(function (item, seriesIndex) {
          if (filter) {
            var linePoints = model.points.map(function (point) {
              return point.x.toFixed(1) + "," + y(point.bands[0].top).toFixed(1);
            });
            children.push(e("polyline", {
              key: "line" + seriesIndex, points: linePoints.join(" "),
              fill: "none", stroke: item.color, strokeWidth: 1.6, strokeLinejoin: "round"
            }));
            return;
          }
          var top = model.points.map(function (point) {
            return point.x.toFixed(1) + "," + y(point.bands[seriesIndex].top).toFixed(1);
          });
          var bottom = model.points.slice().reverse().map(function (point) {
            return point.x.toFixed(1) + "," + y(point.bands[seriesIndex].bottom).toFixed(1);
          });
          children.push(e("path", {
            key: "band" + seriesIndex,
            d: "M" + top.join(" L") + " L" + bottom.join(" L") + " Z",
            fill: item.color, fillOpacity: 0.62, stroke: "none"
          }));
        });

        if (filter) {
          var area = model.points.map(function (point) {
            return point.x.toFixed(1) + "," + y(point.bands[0].top).toFixed(1);
          });
          var floor = (T + plotH).toFixed(1);
          var reversed = model.points.slice().reverse().map(function (point) {
            return point.x.toFixed(1) + "," + floor;
          });
          children.push(e("path", {
            key: "filterarea",
            d: "M" + area.join(" L") + " L" + reversed.join(" L") + " Z",
            fill: COLORS[0], fillOpacity: 0.16
          }));
        }

        if (!filter) {
          var outline = model.points.map(function (point) {
            return point.x.toFixed(1) + "," + y(point.total).toFixed(1);
          });
          children.push(e("polyline", {
            key: "outline", points: outline.join(" "),
            fill: "none", stroke: "rgba(60,70,90,.55)", strokeWidth: 1
          }));
        }

        marks.forEach(function (mark, index) {
          var ratio = (mark.t - model.first) / Math.max(1, model.last - model.first);
          if (ratio < 0 || ratio > 1) return;
          var mx = L + ratio * plotW;
          children.push(e("line", {
            key: "mark" + index, x1: mx, y1: T, x2: mx, y2: T + plotH,
            stroke: WARN, strokeWidth: 1, strokeDasharray: "3 3", opacity: 0.8
          }));
        });

        var pickedPoint = null;
        if (pickedSeq !== null && pickedSeq !== undefined) {
          for (var i = 0; i < model.points.length; i++) {
            if (model.points[i].sample.seq === pickedSeq) { pickedPoint = model.points[i]; break; }
          }
        }
        if (pickedPoint) {
          children.push(e("line", {
            key: "picked", x1: pickedPoint.x, y1: T, x2: pickedPoint.x, y2: T + plotH,
            stroke: ACCENT, strokeWidth: 1, opacity: 0.75
          }));
        }

        var hoverPoint = hover !== null && hover !== undefined ? model.points[hover] : null;
        if (hoverPoint) {
          children.push(e("line", {
            key: "hoverline", x1: hoverPoint.x, y1: T, x2: hoverPoint.x, y2: T + plotH,
            stroke: FG2, strokeWidth: 1, opacity: 0.5
          }));
          children.push(e("circle", {
            key: "hoverdot", cx: hoverPoint.x, cy: y(hoverPoint.total), r: 3,
            fill: ACCENT, stroke: BG1, strokeWidth: 1.5
          }));
        }

        children.push(e("text", { key: "x0", x: L, y: H - 6, fontSize: 8, fill: FG3, fontFamily: MONO }, clock(model.first)));
        children.push(e("text", { key: "x1", x: W - R, y: H - 6, fontSize: 8, fill: FG3, textAnchor: "end", fontFamily: MONO }, clock(model.last)));

        children.push(e("rect", {
          key: "hit",
          x: L, y: T, width: plotW, height: plotH, fill: "transparent",
          style: { cursor: "crosshair" },
          onMouseMove: function (ev) { onHover(indexAt(ev)); },
          onMouseLeave: function () { onHover(null); },
          onClick: function (ev) {
            var index = indexAt(ev);
            if (model.points[index]) onPick(model.points[index].sample.seq);
          }
        }));

        var hovered = hoverPoint && hoverPoint.sample;

        var legend = e("div", {
          style: { display: "flex", flexWrap: "wrap", gap: "3px 10px", marginTop: 5 }
        }, model.series.map(function (item, index) {
          return e("span", {
            key: "legend" + index,
            style: { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9, color: FG2, maxWidth: "46%" }
          },
            e("span", { style: { width: 7, height: 7, borderRadius: 2, background: item.color, flex: "0 0 auto" } }),
            e("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, item.label));
        }));

        // 提示框贴着指针，但靠近右边缘时改成右对齐，避免窄面板里被挤出容器。
        var tipStyle = {
          position: "absolute", top: 4, pointerEvents: "none",
          background: BG1, border: "1px solid " + BORDER, borderRadius: 8,
          padding: "5px 7px", boxShadow: "0 4px 14px rgba(0,0,0,.12)",
          minWidth: 88, maxWidth: "72%", overflow: "hidden"
        };
        if (hoverPoint) {
          var tipPercent = Math.max(0, Math.min(100, hoverPoint.x / W * 100));
          if (tipPercent > 50) tipStyle.right = (100 - tipPercent) + "%";
          else tipStyle.left = tipPercent + "%";
        }

        return e("div", null,
          e("div", { style: { position: "relative" } },
            e("svg", { viewBox: "0 0 " + W + " " + H, style: { display: "block", width: "100%", height: "auto" } }, children),
            hovered ? e("div", { style: tipStyle },
              e("div", { style: { fontSize: 9, color: FG3, fontFamily: MONO } }, clock(hovered.t)),
              e("div", { style: { fontSize: 12, fontWeight: 650, color: FG, fontFamily: MONO } }, fmtMB(hovered.total)),
              (hovered.categories || []).slice(0, 2).map(function (row, index) {
                return e("div", { key: "tt" + index, style: { fontSize: 9, color: FG2, display: "flex", justifyContent: "space-between", gap: 8 } },
                  e("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 92 } }, row.name),
                  e("span", { style: { fontFamily: MONO } }, fmtMB(row.bytes)));
              })
            ) : null
          ),
          legend
        );
      }

      // ------------------------------------------------------------ 列表

      function Rows(props) {
        var rows = props.rows || [];
        var total = props.total || 1;
        var onPick = props.onPick;
        var active = props.active;
        var clickable = props.clickable !== false;
        if (!rows.length) {
          return e("div", { style: { fontSize: 11, color: FG3, padding: "10px 2px" } }, props.empty || "");
        }
        var max = rows.reduce(function (acc, row) { return Math.max(acc, row.bytes); }, 1);
        return e("div", { style: { display: "flex", flexDirection: "column", gap: 3 } },
          rows.map(function (row, index) {
            var share = Math.round(row.bytes / Math.max(1, total) * 1000) / 10;
            var wide = Math.max(2, Math.round(row.bytes / max * 100));
            var isActive = active && row.name === active;
            return e("div", {
              key: row.name + index,
              onClick: clickable && onPick ? function () { onPick(isActive ? null : row.name); } : undefined,
              style: {
                position: "relative", display: "flex", alignItems: "center", gap: 6,
                padding: "4px 6px", borderRadius: 6, cursor: clickable && onPick ? "pointer" : "default",
                background: isActive ? "rgba(74,99,231,.10)" : "transparent",
                border: isActive ? "1px solid rgba(74,99,231,.35)" : "1px solid transparent"
              }
            },
              e("div", {
                style: {
                  position: "absolute", left: 0, top: 0, bottom: 0, width: wide + "%",
                  background: isActive ? "rgba(74,99,231,.16)" : "rgba(120,130,150,.10)",
                  borderRadius: 6, pointerEvents: "none"
                }
              }),
              e("span", {
                style: { position: "relative", flex: 1, minWidth: 0, fontSize: 11, color: FG, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }
              }, row.name),
              e("span", { style: { position: "relative", fontSize: 10, fontFamily: MONO, color: FG2, flex: "0 0 auto" } }, fmtMB(row.bytes)),
              e("span", { style: { position: "relative", fontSize: 9, fontFamily: MONO, color: FG3, flex: "0 0 34px", textAlign: "right" } }, share + "%")
            );
          })
        );
      }

    // 面板：轮询、开始/停止、打点、下钻切换。

      // ------------------------------------------------------------ 面板


      var SMALL_BTN = {
        appearance: "none", border: "1px solid " + BORDER, background: BG1, color: FG2,
        fontSize: 11, borderRadius: 8, padding: "4px 10px", cursor: "pointer"
      };

      var LEVEL_COLOR = { ok: "#1f9d63", watch: WARN, bad: DANGER, inconclusive: FG3 };

      var STATUS_COLOR = { pass: "#1f9d63", warn: "#c78500", fail: DANGER, unknown: FG3 };
      var STATUS_ICON = { pass: "✓", warn: "!", fail: "✕", unknown: "?" };

      function OverviewView(props) {
        var t = props.t;
        var pf = props.preflight;
        return e("div", { style: { display: "flex", flexDirection: "column", gap: 8 } },

          props.assessment
            ? e("div", { style: { background: BG2, border: "1px solid " + BORDER, borderRadius: 14, padding: "14px 16px",
                borderLeft: "3px solid " + LEVEL_COLOR[props.assessment.level],
                boxShadow: "0 1px 2px rgba(0,0,0,.04), 0 6px 16px rgba(0,0,0,.03)" } },
              e("div", { style: { display: "flex", alignItems: "baseline", gap: 8 } },
                e("div", { style: { fontSize: 17, fontWeight: 700, color: LEVEL_COLOR[props.assessment.level], letterSpacing: "-0.01em", lineHeight: 1.35 } },
                  props.assessment.headline),
                props.assessment.ruleId
                  ? e("span", { style: { fontFamily: MONO, fontSize: 9.5, color: FG3, border: "1px solid " + BORDER, borderRadius: 5, padding: "0 4px", flex: "0 0 auto" } }, props.assessment.ruleId)
                  : null),
              e("div", { style: { display: "flex", flexDirection: "column", gap: 3, marginTop: 8 } },
                (props.assessment.reasons || []).map(function (text, index) {
                  return e("div", { key: index, style: { fontSize: 11.5, color: FG2, lineHeight: 1.55, paddingLeft: 10, position: "relative" } },
                    e("span", { style: { position: "absolute", left: 0, color: FG3 } }, "·"),
                    text);
                })),
              props.assessment.next && props.assessment.next.length
                ? e("div", { style: { marginTop: 10, paddingTop: 8, borderTop: "1px dashed " + BORDER, display: "flex", flexDirection: "column", gap: 3 } },
                  e("div", { style: { fontSize: 10, fontWeight: 600, color: FG3, marginBottom: 2 } }, t("panel.assess.next")),
                  props.assessment.next.map(function (text, index) {
                    return e("div", { key: index, style: { fontSize: 11, color: FG2, lineHeight: 1.55 } }, (index + 1) + ". " + text);
                  }))
                : null)
            : e("div", { style: { fontSize: 11, color: FG3, lineHeight: 1.7, background: BG2, border: "1px dashed " + BORDER, borderRadius: 12, padding: "12px 14px" } }, t("panel.overview.empty")),

          e("div", { style: { border: "1px solid " + BORDER, borderRadius: 12, padding: "12px 14px", background: BG1 } },
            e("div", { style: { display: "flex", alignItems: "center", gap: 6 } },
              e("span", { style: { fontSize: 12, fontWeight: 600 } }, t("panel.preflight.title")),
              e("span", { style: { flex: 1 } }),
              e("button", { onClick: props.onPreflight, disabled: props.preflightBusy, style: SMALL_BTN },
                props.preflightBusy ? t("panel.preflight.running") : t("panel.preflight.run"))),
            pf && pf.items
              ? e("div", { style: { display: "flex", flexDirection: "column", gap: 3, marginTop: 8 } },
                pf.items.map(function (item) {
                  return e("div", { key: item.id, style: { display: "flex", gap: 6, alignItems: "baseline" } },
                    e("span", { style: { color: STATUS_COLOR[item.status] || FG3, fontSize: 11, width: 10, flex: "0 0 auto" } }, STATUS_ICON[item.status] || "?"),
                    e("span", { style: { fontSize: 11, color: FG, flex: "0 0 auto" } }, item.title),
                    e("span", { style: { fontSize: 10, color: FG3, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, item.detail));
                }))
              : e("div", { style: { fontSize: 10, color: FG3, marginTop: 6, lineHeight: 1.5 } }, t("panel.preflight.empty")),
            pf && pf.dir
              ? e("div", { style: { fontSize: 8, fontFamily: MONO, color: FG3, marginTop: 6, wordBreak: "break-all" } }, pf.dir + "/report.md")
              : null),

          props.handoff
            ? e("div", { style: { background: BG2, borderRadius: 12, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4 } },
              e("div", { style: { fontSize: 11, fontWeight: 600, color: props.handoff.copied ? "#1f9d63" : WARN } },
                props.handoff.copied ? t("panel.handoff.copied") : t("panel.handoff.failed")),
              e("div", { style: { fontSize: 8, fontFamily: MONO, color: FG3, wordBreak: "break-all", lineHeight: 1.4 } }, props.handoff.path),
              props.handoff.copied ? null : e("button", { onClick: props.onCopy, style: Object.assign({}, SMALL_BTN, { alignSelf: "flex-start" }) }, t("panel.handoff.copy")))
            : null,

          props.runs && props.runs.filter(function (run) { return run.events > 0; }).length
            ? e("div", { style: { display: "flex", flexDirection: "column", gap: 3 } },
              e("div", { style: { fontSize: 13, fontWeight: 600, color: FG2 } }, t("panel.records.title")),
              props.runs.filter(function (run) { return run.events > 0; }).slice(0, 3).map(function (run) {
                return e("div", { key: run.runId, style: { display: "flex", alignItems: "center", gap: 6, background: BG2, border: "1px solid " + BORDER, borderRadius: 10, padding: "7px 10px" } },
                  e("span", { style: { fontSize: 9, fontFamily: MONO, color: FG3 } }, props.clock(run.from)),
                  e("span", { style: { fontSize: 10, color: FG2, flex: 1 } }, run.events + " " + t("panel.records.points")),
                  e("button", { onClick: function () { props.onReport(run); }, style: SMALL_BTN }, t("panel.records.open")));
              }))
            : null
        );
      }

      function RecordsView(props) {
        var t = props.t;
        return e("div", { style: { display: "flex", flexDirection: "column", gap: 6 } },
          e("div", { style: { display: "flex", alignItems: "center", gap: 6 } },
            e("span", { style: { fontSize: 12, fontWeight: 600 } }, t("panel.records.title")),
            e("span", { style: { flex: 1 } }),
            e("button", { onClick: props.onExport, disabled: props.busy, style: SMALL_BTN }, t("panel.export"))),
          props.handoff
            ? e("div", { style: { background: BG2, borderRadius: 12, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4 } },
              e("div", { style: { fontSize: 11, fontWeight: 600, color: props.handoff.copied ? "#1f9d63" : WARN } },
                props.handoff.copied ? t("panel.handoff.copied") : t("panel.handoff.failed")),
              e("div", { style: { fontSize: 8, fontFamily: MONO, color: FG3, wordBreak: "break-all", lineHeight: 1.4 } }, props.handoff.path),
              props.handoff.copied ? null : e("button", { onClick: props.onCopy, style: Object.assign({}, SMALL_BTN, { alignSelf: "flex-start" }) }, t("panel.handoff.copy")))
            : null,

          props.runs.length === 0
            ? e("div", { style: { fontSize: 11, color: FG3, lineHeight: 1.6, padding: "8px 2px" } }, t("panel.records.empty"))
            : props.runs.filter(function (run) { return run.events > 0; }).map(function (run) {
              return e("div", { key: run.runId, style: { display: "flex", alignItems: "center", gap: 6, background: BG2, border: "1px solid " + BORDER, borderRadius: 10, padding: "8px 10px" } },
                e("span", { style: { fontSize: 10, fontFamily: MONO, color: FG3, flex: "0 0 auto" } }, props.clock(run.from)),
                e("span", { style: { fontSize: 12, color: FG, flex: "0 0 auto" } }, run.mode === "trace" ? "回放" : "采样"),
                e("span", { style: { fontSize: 11, color: FG3, flex: 1 } }, run.events + " " + t("panel.records.points") + (run.hasReport ? " · 有报告" : "")),
                e("button", { onClick: function () { props.onReport(run); }, style: SMALL_BTN }, t("panel.records.open")));
            }),
          props.reportPath
            ? e("div", { style: { fontSize: 8, fontFamily: MONO, color: FG3, wordBreak: "break-all", lineHeight: 1.4 } }, props.reportPath)
            : null
        );
      }


      function CatalogView(props) {
        var t = props.t;
        var modules = props.catalog || [];
        return e("div", { style: { display: "flex", flexDirection: "column", gap: 8 } },
          e("div", { style: { fontSize: 13, fontWeight: 600 } }, t("panel.catalog.title")),
          e("div", { style: { fontSize: 10, color: FG3, lineHeight: 1.5 } }, t("panel.catalog.note")),
          modules.length === 0
            ? e("div", { style: { fontSize: 11, color: FG3 } }, t("panel.loading"))
            : modules.map(function (module) {
              return e("div", { key: module.id, style: { border: "1px solid " + BORDER, borderRadius: 12, padding: "10px 12px", background: BG1 } },
                e("div", { style: { display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 } },
                  e("span", { style: { fontFamily: MONO, fontSize: 10, color: FG3 } }, module.id),
                  e("span", { style: { fontSize: 12, fontWeight: 650 } }, module.title),
                  e("span", { style: { fontSize: 10, color: FG3, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, module.summary)),
                (module.items || []).map(function (group) {
                  return e("div", { key: group.id, style: { marginTop: 4 } },
                    e("div", { style: { display: "flex", gap: 6, alignItems: "baseline" } },
                      e("span", { style: { fontFamily: MONO, fontSize: 9.5, color: FG3 } }, group.id),
                      e("span", { style: { fontSize: 11, fontWeight: 600, color: FG2 } }, group.title)),
                    (group.items || []).map(function (item) {
                      return e("div", { key: item.id, style: { display: "flex", gap: 6, alignItems: "baseline", paddingLeft: 12, marginTop: 2 } },
                        e("span", { style: { fontFamily: MONO, fontSize: 9.5, color: FG3, flex: "0 0 auto" } }, item.id),
                        e("span", { style: { fontSize: 11, color: FG } }, item.title),
                        e("span", { style: { fontSize: 9.5, color: FG3, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, item.note || ""));
                    }));
                }));
            })
        );
      }

      function Panel(props) {
        var t = props.t || function (key) { return key; };
        var rpc = props.rpc || callRpc;

        var [targets, setTargets] = useState([]);
        var [targetsError, setTargetsError] = useState("");
        var [pick, setPick] = useState("");
        var [running, setRunning] = useState(false);
        var [mode, setMode] = useState("live");
        var [serverTarget, setServerTarget] = useState(null);
        var [samples, setSamples] = useState([]);
        var [marks, setMarks] = useState([]);
        var [summary, setSummary] = useState(null);
        var [error, setError] = useState("");
        var [intervalMs, setIntervalMs] = useState(1000);
        var [windowSec, setWindowSec] = useState(1800);
        var [hover, setHover] = useState(null);
        var [pickedSeq, setPickedSeq] = useState(null);
        var [dim, setDim] = useState("category");
        var [detail, setDetail] = useState(null);
        var [detailLoading, setDetailLoading] = useState(false);
        var [busy, setBusy] = useState(false);
        var [markOpen, setMarkOpen] = useState(false);
        var [markText, setMarkText] = useState("");
        var [filter, setFilter] = useState(null);
        var [runs, setRuns] = useState([]);
        var [showRuns, setShowRuns] = useState(true);
        var [reportPath, setReportPath] = useState("");
        var [runBusy, setRunBusy] = useState(false);
        var [view, setView] = useState("overview");
        var [preflight, setPreflight] = useState(null);
        var [preflightBusy, setPreflightBusy] = useState(false);
        var [handoff, setHandoff] = useState(null);
        var [assessment, setAssessment] = useState(null);
        var [catalog, setCatalog] = useState([]);

        var sinceRef = useRef(0);
        var startedRef = useRef(null);

        var options = useMemo(function () {
          var list = [];
          (targets || []).forEach(function (device) {
            (device.apps || []).forEach(function (app) {
              list.push({
                key: device.udid + "|" + app.bundleId,
                udid: device.udid,
                bundleId: app.bundleId,
                label: device.name + " · " + app.name,
              });
            });
          });
          return list;
        }, [targets]);

        var loadTargets = function () {
          setTargetsError("");
          return rpc("targets", {}).then(function (res) {
            if (res && res.ok && res.value) {
              var devices = res.value.devices || [];
              setTargets(devices);
              if (devices.length === 0) setTargetsError(t("panel.noTargets"));
            } else {
              setTargetsError((res && res.error && res.error.message) || t("panel.noTargets"));
            }
          });
        };

        useEffect(function () { void loadTargets(); }, []);

        useEffect(function () {
          void loadRuns();
        }, []);

        useEffect(function () {
          if (view !== "catalog" || catalog.length) return;
          rpc("catalog", {}).then(function (res) {
            if (res && res.ok && res.value) setCatalog(res.value.modules || []);
          });
        }, [view, catalog.length]);

        function loadRuns() {
          return rpc("runs", { limit: 20 }).then(function (res) {
            if (res && res.ok && res.value) setRuns(res.value.runs || []);
          });
        }

        function exportRun() {
          setRunBusy(true);
          rpc("export", { lastSeconds: 120 }).then(function (res) {
            setRunBusy(false);
            if (res && res.ok && res.value) {
              setShowRuns(true);
              setReportPath(res.value.dir || "");
              void loadRuns();
            }
          });
        }

        function makeReport(run) {
          setRunBusy(true);
          var project = serverTarget && serverTarget.bundleId
            ? serverTarget.bundleId.split(".").pop()
            : "unknown";
          rpc("report", { runId: run.runId, project: project, title: "采集 " + run.runId }).then(function (res) {
            setRunBusy(false);
            if (!res || !res.ok || !res.value) return;
            setReportPath(res.value.path || "");
            if (!res.value.handoff) return;
            var text = res.value.handoff;
            setHandoff({ path: res.value.path || "", text: text, copied: false });
            copyText(text).then(function (ok) {
              setHandoff({ path: res.value.path || "", text: text, copied: ok });
            });
          });
        }

        function runPreflightCheck() {
          setPreflightBusy(true);
          var bundleId = serverTarget ? serverTarget.bundleId : (pick ? pick.split("|")[1] : "");
          rpc("preflight", { bundleId: bundleId }).then(function (res) {
            setPreflightBusy(false);
            if (res && res.ok && res.value) setPreflight(res.value);
          });
        }

        function copyText(text) {
          var legacy = function () {
            try {
              var area = document.createElement("textarea");
              area.value = text;
              area.style.position = "fixed";
              area.style.opacity = "0";
              document.body.appendChild(area);
              area.select();
              var ok = document.execCommand("copy");
              document.body.removeChild(area);
              return ok;
            } catch (err) {
              return false;
            }
          };
          if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text).then(function () { return true; }).catch(legacy);
          }
          return Promise.resolve(legacy());
        }

        function shortClock(iso) {
          if (!iso) return "--:--";
          var date = new Date(iso);
          if (isNaN(date.getTime())) return "--:--";
          return pad(date.getHours()) + ":" + pad(date.getMinutes());
        }

        useEffect(function () {
          if (!pick && options.length) setPick(options[0].key);
        }, [options, pick]);

        useEffect(function () {
          if (!serverTarget || !options.length) return;
          var key = serverTarget.udid + "|" + serverTarget.bundleId;
          if (key !== pick && options.some(function (option) { return option.key === key; })) setPick(key);
        }, [serverTarget && serverTarget.pid, options, pick]);

        useEffect(function () {
          var alive = true;
          var timer = null;

          function pull() {
            rpc("state", { since: sinceRef.current, limit: MAX_POINTS }).then(function (res) {
              if (!alive) return;
              if (res && res.ok && res.value) {
                var value = res.value;
                setRunning(!!value.running);
                setMode(value.mode || "live");
                setServerTarget(value.target || null);
                setError(value.error || "");
                setMarks(value.marks || []);
                setSummary(value.summary || null);
                setAssessment(value.assessment || null);
                if (value.intervalMs) setIntervalMs(value.intervalMs);

                if (startedRef.current === null) {
                  startedRef.current = value.startedAt || 0;
                } else if ((value.startedAt || 0) !== startedRef.current) {
                  startedRef.current = value.startedAt || 0;
                  sinceRef.current = 0;
                  setSamples([]);
                  setPickedSeq(null);
                  setHover(null);
                  setFilter(null);
                  // 换了一轮采样：本地样本清空，下一拍从 0 重新拉；这里必须先续上下一次轮询。
                  if (alive) timer = setTimeout(pull, 1000);
                  return;
                }

                if (Array.isArray(value.samples) && value.samples.length) {
                  sinceRef.current = value.seq;
                  setSamples(function (prev) {
                    var map = new Map();
                    for (var i = 0; i < prev.length; i++) map.set(prev[i].seq, prev[i]);
                    for (var j = 0; j < value.samples.length; j++) map.set(value.samples[j].seq, value.samples[j]);
                    var merged = Array.from(map.values()).sort(function (a, b) { return a.seq - b.seq; });
                    return merged.length > MAX_POINTS ? merged.slice(merged.length - MAX_POINTS) : merged;
                  });
                } else if (typeof value.seq === "number" && value.seq > sinceRef.current) {
                  sinceRef.current = value.seq;
                }
              }
              if (alive) timer = setTimeout(pull, 1000);
            });
          }

          pull();
          return function () {
            alive = false;
            if (timer) clearTimeout(timer);
          };
        }, []);

        useEffect(function () {
          if (dim === "category") return undefined;
          var alive = true;
          var timer = null;
          function load() {
            setDetailLoading(true);
            rpc("detail", {}).then(function (res) {
              if (!alive) return;
              setDetailLoading(false);
              if (res && res.ok && res.value) setDetail(res.value);
              else if (res && res.error) setDetail({ error: res.error.message });
              timer = setTimeout(load, 5000);
            });
          }
          load();
          return function () {
            alive = false;
            if (timer) clearTimeout(timer);
          };
        }, [dim]);

        var visible = useMemo(function () {
          if (!samples.length) return [];
          var last = samples[samples.length - 1].t;
          var from = last - windowSec * 1000;
          return samples.filter(function (sample) { return sample.t >= from; });
        }, [samples, windowSec]);

        var windowStats = useMemo(function () {
          if (!visible.length) return null;
          var totals = visible.map(function (sample) { return sample.total; });
          var first = totals[0];
          var last = totals[totals.length - 1];
          return {
            current: last,
            peak: Math.max.apply(null, totals),
            delta: last - first,
            count: visible.length,
          };
        }, [visible]);

        var verdict = null;
        if (windowStats) {
          var trend = windowStats.delta;
          if (windowStats.current >= 400 * 1048576) {
            verdict = { color: DANGER, value: fmtMB(windowStats.current), text: t("panel.verdict.high") };
          } else if (windowStats.current >= 200 * 1048576) {
            verdict = { color: WARN, value: fmtMB(windowStats.current), text: t("panel.verdict.watch") };
          } else if (trend > 5 * 1048576) {
            verdict = { color: WARN, value: fmtMB(windowStats.current), text: t("panel.verdict.rising") + " " + fmtMB(trend) };
          } else {
            verdict = { color: "#1f9d63", value: fmtMB(windowStats.current), text: t("panel.verdict.ok") };
          }
        }

        var pickedSample = useMemo(function () {
          if (pickedSeq === null) return visible.length ? visible[visible.length - 1] : null;
          for (var i = 0; i < samples.length; i++) {
            if (samples[i].seq === pickedSeq) return samples[i];
          }
          return visible.length ? visible[visible.length - 1] : null;
        }, [samples, visible, pickedSeq]);

        var selected = options.filter(function (option) { return option.key === pick; })[0] || null;

        function start() {
          if (!selected) { setError(t("panel.needTarget")); return; }
          setBusy(true);
          rpc("start", { udid: selected.udid, bundleId: selected.bundleId, intervalMs: intervalMs }).then(function (res) {
            setBusy(false);
            if (res && res.ok) {
              sinceRef.current = 0;
              startedRef.current = null;
              setSamples([]);
              setPickedSeq(null);
              setFilter(null);
              setError("");
            } else {
              setError((res && res.error && res.error.message) || t("panel.error"));
            }
          });
        }

        function stop() {
          setBusy(true);
          rpc("stop", {}).then(function () { setBusy(false); });
        }

        function saveMark() {
          var label = markText.trim();
          if (!label) { setMarkOpen(false); return; }
          rpc("mark", { label: label }).then(function () { setMarkOpen(false); setMarkText(""); });
        }

        var dimRows = [];
        var dimTotal = 1;
        if (dim === "category" && pickedSample) {
          dimRows = (pickedSample.categories || []).slice(0, 14);
          dimTotal = pickedSample.total;
        } else if (detail && !detail.error) {
          dimRows = (dim === "image" ? detail.images : detail.tags) || [];
          dimTotal = (dim === "image" ? detail.imagesTotal : detail.tagsTotal) || detail.total || 1;
        }

        var statusText = running
          ? t("panel.status.running") + " · " + shortTime(Math.round(intervalMs / 1000)) + (serverTarget ? " · " + serverTarget.appName : "")
          : (mode === "trace" && samples.length ? t("panel.status.trace") : t("panel.status.idle"));

        var buttonStyle = function (primary, disabled) {
          return {
            appearance: "none", border: "1px solid " + (primary ? ACCENT : BORDER),
            background: primary ? ACCENT : BG1,
            color: primary ? "#fff" : FG, borderRadius: 7,
            padding: "4px 10px", fontSize: 11, fontWeight: 550,
            cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1,
          };
        };

        return e("div", { style: { display: "flex", flexDirection: "column", gap: 10, padding: "10px 16px 22px", maxWidth: 620, margin: "0 auto", color: FG, minWidth: 0, width: "100%", boxSizing: "border-box", overflowX: "hidden" } },

          e("div", { style: { display: "flex", alignItems: "center", gap: 6 } },
            e("span", { style: { width: 6, height: 6, borderRadius: 99, background: running ? "#1f9d63" : FG3 } }),
            e("span", { style: { fontSize: 11, color: FG2 } }, statusText),
            e("span", { style: { flex: 1 } })
          ),

          e("div", { style: { display: "flex", gap: 2, background: BG2, border: "1px solid " + BORDER, borderRadius: 10, padding: 3 } },
            ["overview", "memory", "records", "catalog"].map(function (key) {
              var active = view === key;
              return e("button", {
                key: key,
                onClick: function () { setView(key); },
                style: {
                  flex: 1, appearance: "none", border: 0, borderRadius: 8, padding: "5px 0",
                  fontSize: 11.5, fontWeight: active ? 650 : 500, cursor: "pointer",
                  background: active ? BG1 : "transparent", color: active ? FG : FG3,
                  boxShadow: active ? "0 1px 2px rgba(0,0,0,.08)" : "none"
                }
              }, t("panel.view." + key));
            })),

          view === "memory" ? e("div", { style: { display: "flex", flexDirection: "column", gap: 8 } },
          e("div", { style: { display: "flex", gap: 4 } },
            e("select", {
              value: pick,
              onChange: function (ev) { setPick(ev.target.value); },
              style: {
                flex: 1, minWidth: 0, fontSize: 11, padding: "4px 6px",
                borderRadius: 7, border: "1px solid " + BORDER, background: BG1, color: FG
              }
            },
              options.length === 0
                ? e("option", { value: "" }, t("panel.noTargets"))
                : options.map(function (option) { return e("option", { key: option.key, value: option.key }, option.label); })
            ),
            e("button", { onClick: function () { void loadTargets(); }, style: buttonStyle(false, false), title: t("panel.refresh") }, "↻")
          ),

          targetsError ? e("div", { style: { fontSize: 10, color: FG3, lineHeight: 1.5 } }, targetsError) : null,

          e("div", { style: { display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" } },
            running
              ? e("button", { onClick: stop, disabled: busy, style: buttonStyle(true, busy) }, t("panel.stop"))
              : e("button", { onClick: start, disabled: busy, style: buttonStyle(true, busy) }, t("panel.start")),
            e("select", {
              value: String(intervalMs), onChange: function (ev) { setIntervalMs(Number(ev.target.value)); },
              style: { fontSize: 10, padding: "3px 4px", borderRadius: 6, border: "1px solid " + BORDER, background: BG1, color: FG2 }
            }, INTERVALS.map(function (value) {
              return e("option", { key: value, value: String(value) }, value + "ms");
            })),
            e("select", {
              value: String(windowSec), onChange: function (ev) { setWindowSec(Number(ev.target.value)); },
              title: t("panel.window"),
              style: { fontSize: 10, padding: "3px 4px", borderRadius: 6, border: "1px solid " + BORDER, background: BG1, color: FG2 }
            }, WINDOWS.map(function (value) {
              return e("option", { key: value, value: String(value) }, shortTime(value));
            })),
            e("span", { style: { flex: 1 } }),
            markOpen
              ? e("input", {
                value: markText, autoFocus: true,
                placeholder: t("panel.markPlaceholder"),
                onChange: function (ev) { setMarkText(ev.target.value); },
                onKeyDown: function (ev) {
                  if (ev.key === "Enter") saveMark();
                  if (ev.key === "Escape") setMarkOpen(false);
                },
                onBlur: saveMark,
                style: { width: 120, fontSize: 10, padding: "3px 6px", borderRadius: 6, border: "1px solid " + BORDER, background: BG1, color: FG }
              })
              : e("button", { onClick: function () { setMarkOpen(true); }, style: buttonStyle(false, false) }, t("panel.mark"))
          ),

          error ? e("div", { style: { fontSize: 10, color: DANGER, lineHeight: 1.4 } }, t("panel.error") + "：" + error) : null,

          samples.length === 0
            ? e("div", { style: { border: "1px dashed " + BORDER, borderRadius: 10, padding: "18px 14px", textAlign: "center" } },
              e("div", { style: { fontSize: 12, fontWeight: 600, marginBottom: 4 } }, t("panel.empty.title")),
              e("div", { style: { fontSize: 10, color: FG2, lineHeight: 1.5 } }, t("panel.empty.body")))
            : e("div", null,
              e("div", { style: { border: "1px solid " + BORDER, borderRadius: 12, padding: "6px 6px 2px", background: BG1 } }, e(Timeline, {
                samples: visible, marks: marks, filter: filter, hover: hover,
                onHover: setHover, pickedSeq: pickedSeq, onPick: setPickedSeq, t: t
              }),
              filter ? e("div", { style: { display: "flex", alignItems: "center", gap: 6, marginTop: 4 } },
                e("span", { style: { fontSize: 10, color: FG2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, t("panel.filterOn") + "：" + filter),
                e("button", { onClick: function () { setFilter(null); }, style: { appearance: "none", border: 0, background: "transparent", color: ACCENT, fontSize: 10, cursor: "pointer", padding: 0 } }, t("panel.clear"))
              ) : null
            )),

          e("div", { style: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6 } },
            statCell(t("panel.current"), windowStats ? fmtMB(windowStats.current) : "—", FG),
            statCell(t("panel.peak"), windowStats ? fmtMB(windowStats.peak) : "—", FG),
            statCell(t("panel.delta"), windowStats ? (windowStats.delta >= 0 ? "+" : "") + fmtMB(windowStats.delta) : "—", windowStats && windowStats.delta > 0 ? WARN : "#1f9d63"),
            statCell(t("panel.samples"), windowStats ? String(windowStats.count) : "0", FG)
          ),

          assessment
            ? e("div", { style: { display: "flex", gap: 6, alignItems: "baseline", background: BG2, border: "1px solid " + BORDER, borderRadius: 10, padding: "7px 10px" } },
              e("span", { style: { width: 6, height: 6, borderRadius: 99, background: LEVEL_COLOR[assessment.level], flex: "0 0 auto", marginTop: 4 } }),
              e("span", { style: { fontSize: 11, color: FG2, lineHeight: 1.5 } },
                e("strong", { style: { color: FG } }, assessment.headline),
                assessment.reasons && assessment.reasons[0] ? " · " + assessment.reasons[0] : ""))
            : null,

          e("div", { style: { display: "flex", alignItems: "center", gap: 2, borderBottom: "1px solid " + BORDER } },
            [["category", t("panel.category")], ["image", t("panel.image")], ["tag", t("panel.tag")]].map(function (pair) {
              var key = pair[0];
              var active = dim === key;
              return e("button", {
                key: key, onClick: function () { setDim(key); },
                style: {
                  appearance: "none", border: 0, background: "transparent",
                  padding: "6px 10px", fontSize: 12, cursor: "pointer",
                  color: active ? FG : FG3, fontWeight: active ? 650 : 450,
                  borderBottom: "2px solid " + (active ? ACCENT : "transparent"),
                  marginBottom: -1,
                }
              }, pair[1]);
            }),
            e("span", { style: { flex: 1 } }),
            pickedSeq !== null && dim === "category"
              ? e("button", { onClick: function () { setPickedSeq(null); }, style: { appearance: "none", border: 0, background: "transparent", color: FG3, fontSize: 9, cursor: "pointer" } }, t("panel.clear"))
              : null
          ),

          e("div", { style: { fontSize: 10, color: FG3, lineHeight: 1.4 } },
            dim === "category" ? t("panel.hint.category") : t("panel.hint.dim")),

          dim !== "category"
            ? e("div", { style: { fontSize: 9, color: FG3, lineHeight: 1.4 } },
              detailLoading
                ? t("panel.loading")
                : detail && detail.at
                  ? (dim === "image"
                    ? t("panel.imageNote") + " · " + fmtMB(detail.imagesTotal || 0)
                    : t("panel.detailNow"))
                  : t("panel.noDetail"))
            : null,

          detail && detail.error
            ? e("div", { style: { fontSize: 10, color: DANGER } }, detail.error)
            : e(Rows, {
              rows: dimRows.map(function (row) { return { name: row.name, bytes: row.bytes }; }),
              total: dimTotal,
              active: dim === "category" ? filter : null,
              clickable: dim === "category",
              onPick: function (name) { setFilter(name); },
              empty: dim === "category" ? t("panel.empty.body") : t("panel.noDetail")
            }),

          marks.length
            ? e("div", { style: { display: "flex", flexWrap: "wrap", gap: 4 } },
              marks.slice(-6).map(function (mark, index) {
                return e("span", {
                  key: index, title: clock(mark.t),
                  style: { fontSize: 9, color: FG2, background: BG2, borderRadius: 99, padding: "2px 7px", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }
                }, clock(mark.t) + " " + mark.label);
              }))
            : null,

          e("div", { style: { fontSize: 10, color: FG3, lineHeight: 1.5 } }, t("panel.footer.sim")),

          hover === null && samples.length > 0
            ? e("div", { style: { fontSize: 9, color: FG3 } }, t("panel.hover.none"))
            : null
          ) : null,

          view === "overview"
            ? e(OverviewView, {
              t: t,
              assessment: assessment,
              preflight: preflight,
              preflightBusy: preflightBusy,
              onPreflight: runPreflightCheck,
              runs: runs,
              clock: shortClock,
              onReport: makeReport,
              handoff: handoff,
              onCopy: function () { if (handoff) copyText(handoff.text).then(function (ok) { setHandoff({ path: handoff.path, text: handoff.text, copied: ok }); }); },
            })
            : null,

          view === "catalog" ? e(CatalogView, { t: t, catalog: catalog }) : null,

          view === "records"
            ? e(RecordsView, {
              t: t,
              runs: runs,
              clock: shortClock,
              onReport: makeReport,
              onExport: exportRun,
              busy: runBusy,
              reportPath: reportPath,
            })
            : null
        );
      }

      function statCell(label, value, color) {
        return e("div", { style: { background: BG2, border: "1px solid " + BORDER, borderRadius: 10, padding: "6px 8px", minWidth: 0, boxSizing: "border-box", overflow: "hidden" } },
          e("div", { style: { fontSize: 10, color: FG3, marginBottom: 2, whiteSpace: "nowrap" } }, label),
          e("div", { style: { fontSize: 13, fontWeight: 650, fontFamily: MONO, color: color || FG, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, value)
        );
      }

    // 注册：右侧栏 tab 与 slot。

      // ------------------------------------------------------------ 注册

      var inject = ["slots", "sidebarRightTabs", "locale"];

      function apply(ctx) {
        ctx.effect(function () {
          return ctx.locale.register(NS, { zh: zh, en: en });
        }, "ios-mem: dictionaries");

        var t = ctx.locale.bind(NS);

        ctx.effect(function () {
          return ctx.sidebarRightTabs.register({
            id: PANEL_ID,
            kind: TAB_KIND,
            priority: "extension",
            title: function () { return t("tab.title"); },
            guide: [{
              id: "ios-mem",
              order: 61,
              title: function () { return t("guide.title"); },
              description: function () { return t("guide.description"); }
            }]
          });
        }, "ios-mem: tab type");

        ctx.effect(function () {
          return ctx.slots.inject("sidebar.right.pane.tab", function () {
            return ctx.slots.register({
              name: "sidebar.right.pane.tab",
              key: PANEL_ID,
              locale: NS,
              inject: function () { return { t: t, rpc: callRpc }; }
            }, Panel);
          });
        }, "ios-mem: tab body");
      }

      module.exports = { apply: apply, inject: inject, __test: { Panel: Panel, Timeline: Timeline, Rows: Rows } };
      return module.exports;


    module.exports = { apply: apply, inject: inject, __test: { Panel: Panel, Timeline: Timeline, Rows: Rows } };
    return module.exports;
  }
});
