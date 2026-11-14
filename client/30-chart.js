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
