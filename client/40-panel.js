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

      props.reportError
        ? e("div", { style: { fontSize: 11, color: DANGER, lineHeight: 1.5, background: BG2, border: "1px solid " + BORDER, borderRadius: 8, padding: "7px 10px" } }, props.reportError)
        : null,

      props.assessment
        ? e("div", { style: { background: BG2, border: "1px solid " + BORDER, borderRadius: 14, padding: "14px 16px",
            boxShadow: "0 1px 2px rgba(0,0,0,.04), 0 6px 16px rgba(0,0,0,.03)" } },
          e("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
            e("span", { style: { width: 8, height: 8, borderRadius: 99, background: LEVEL_COLOR[props.assessment.level], flex: "0 0 auto" } }),
            e("div", { style: { fontSize: 16.5, fontWeight: 700, color: LEVEL_COLOR[props.assessment.level], letterSpacing: "-0.01em", lineHeight: 1.35 } },
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

      props.diagTargets && props.diagTargets.length
        ? e("datalist", { id: "diag-targets" },
          props.diagTargets.map(function (path) { return e("option", { key: path, value: path }); }))
        : null,

      e("input", {
        list: "diag-targets",
        value: props.diagTarget,
        onChange: function (ev) { props.onTargetChange(ev.target.value); },
        placeholder: t("panel.diagnose.target"),
        style: { width: "100%", boxSizing: "border-box", fontSize: 11, padding: "6px 9px", borderRadius: 8, border: "1px solid " + BORDER, background: BG1, color: FG }
      }),

      e("label", { style: { display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: FG2, cursor: "pointer" } },
        e("input", { type: "checkbox", checked: props.includeDevice, onChange: function () { props.onToggleDevice(!props.includeDevice); } }),
        t("panel.diagnose.includeDevice")),

      e("div", { style: { display: "flex", gap: 6 } },
        e("button", {
          onClick: props.onDiagnose,
          disabled: props.diagnoseBusy || !props.diagTarget,
          style: Object.assign({}, SMALL_BTN, {
            flex: 1,
            background: props.diagTarget ? ACCENT : BG1,
            color: props.diagTarget ? "#fff" : FG3,
            border: "1px solid " + (props.diagTarget ? ACCENT : BORDER),
            padding: "8px 10px", fontSize: 12, fontWeight: 600,
          })
        }, props.diagnoseBusy ? t("panel.diagnose.running") : t("panel.diagnose.run"))),

      props.diagnose
        ? e("div", { style: { border: "1px solid " + BORDER, borderRadius: 14, padding: "12px 14px", background: BG1, display: "flex", flexDirection: "column", gap: 6 } },
          e("div", { style: { display: "flex", alignItems: "baseline", gap: 8 } },
            e("div", { style: { fontSize: 16, fontWeight: 700, color: LEVEL_COLOR[props.diagnose.result.level] || FG } }, props.diagnose.result.headline),
            e("span", { style: { flex: 1 } }),
            e("span", { style: { fontSize: 9, fontFamily: MONO, color: FG3 } }, props.diagnose.path.split("/").pop())),
          props.diagnose.result.modules.map(function (module) {
            return e("div", { key: module.id, style: { display: "flex", gap: 6, alignItems: "baseline" } },
              e("span", { style: { fontFamily: MONO, fontSize: 9.5, color: FG3, flex: "0 0 auto" } }, "[" + module.id + "]"),
              e("span", { style: { fontSize: 11, color: FG, flex: "0 0 auto" } }, module.name),
              e("span", { style: { fontSize: 10.5, color: module.level ? LEVEL_COLOR[module.level] : FG3, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } },
                module.headline));
          }))
        : null,


      props.handoff
        ? e("div", { style: { background: BG2, borderRadius: 12, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4 } },
          e("div", { style: { fontSize: 11, fontWeight: 600, color: props.handoff.copied ? "#1f9d63" : WARN } },
            props.handoff.copied ? t("panel.handoff.copied") : t("panel.handoff.failed")),
          e("div", { style: { fontSize: 8, fontFamily: MONO, color: FG3, wordBreak: "break-all", lineHeight: 1.4 } }, props.handoff.path),
          props.handoff.copied ? null : e("button", { onClick: props.onCopy, style: Object.assign({}, SMALL_BTN, { alignSelf: "flex-start" }) }, t("panel.handoff.copy")))
        : null,

      props.diagnoses && props.diagnoses.length
        ? e("div", { style: { display: "flex", flexDirection: "column", gap: 3 } },
          e("div", { style: { fontSize: 13, fontWeight: 600, color: FG2 } }, t("panel.records.title")),
          props.diagnoses.slice(0, 6).map(function (row) {
            return e("div", { key: row.id, style: { display: "flex", alignItems: "center", gap: 6, background: BG2, border: "1px solid " + BORDER, borderRadius: 10, padding: "7px 10px" } },
              e("span", { style: { width: 6, height: 6, borderRadius: 99, background: LEVEL_COLOR[row.level] || FG3, flex: "0 0 auto" } }),
              e("span", { style: { fontSize: 9, fontFamily: MONO, color: FG3, flex: "0 0 auto" } }, props.clock(row.at)),
              e("span", { style: { fontSize: 11, color: FG2, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, row.headline),
              e("button", { onClick: function () { props.onCopyRecord(row); }, style: SMALL_BTN }, t("panel.records.open")));
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
        : props.runs.filter(function (run) { return run.events > 0 || run.kind === 'preflight'; }).map(function (run) {
          return e("div", { key: run.runId, style: { display: "flex", alignItems: "center", gap: 6, background: BG2, border: "1px solid " + BORDER, borderRadius: 10, padding: "8px 10px" } },
            e("span", { style: { fontSize: 10, fontFamily: MONO, color: FG3, flex: "0 0 auto" } }, props.clock(run.from)),
            e("span", { style: { fontSize: 12, color: FG, flex: "0 0 auto" } },
              run.kind === "preflight" ? t("panel.records.check") : (run.mode === "trace" ? "回放" : "采样")),
            e("span", { style: { fontSize: 11, color: FG3, flex: 1 } },
              run.kind === "preflight" ? t("panel.records.ready") : run.events + " " + t("panel.records.points") + (run.hasReport ? " · 有报告" : "")),
            e("button", {
              onClick: function () { props.onReport(run); },
              style: SMALL_BTN
            }, run.kind === "preflight" ? t("panel.records.path") : t("panel.records.open")));
        }),
      props.reportPath
        ? e("div", { style: { fontSize: 8, fontFamily: MONO, color: FG3, wordBreak: "break-all", lineHeight: 1.4 } }, props.reportPath)
        : null
    );
  }



  function CodeView(props) {
    var t = props.t;
    var h = props.health;
    return e("div", { style: { display: "flex", flexDirection: "column", gap: 8 } },
      e("div", { style: { display: "flex", alignItems: "center", gap: 6 } },
        e("span", { style: { fontSize: 13, fontWeight: 600 } }, t("panel.view.code")),
        e("span", { style: { flex: 1 } }),
        e("button", { onClick: props.onScan, disabled: props.busy || !props.target, style: SMALL_BTN },
          props.busy ? t("panel.code.scanning") : t("panel.code.scan"))),

      h && h.assessment
        ? e("div", { style: { background: BG2, border: "1px solid " + BORDER, borderRadius: 14, padding: "14px 16px" } },
          e("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
            e("span", { style: { width: 8, height: 8, borderRadius: 99, background: LEVEL_COLOR[h.assessment.level], flex: "0 0 auto" } }),
            e("div", { style: { fontSize: 16, fontWeight: 700, color: LEVEL_COLOR[h.assessment.level] } }, h.assessment.headline),
            e("span", { style: { fontFamily: MONO, fontSize: 9.5, color: FG3, border: "1px solid " + BORDER, borderRadius: 5, padding: "0 4px" } }, h.assessment.ruleId)),
          (h.assessment.reasons || []).map(function (text, index) {
            return e("div", { key: index, style: { fontSize: 11.5, color: FG2, marginTop: 4, lineHeight: 1.55 } }, "· " + text);
          }))
        : e("div", { style: { fontSize: 11, color: FG3, lineHeight: 1.6, border: "1px dashed " + BORDER, borderRadius: 12, padding: "12px 14px" } }, t("panel.code.empty")),

      h
        ? e("div", { style: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 } },
          statCell(t("panel.code.files"), String(h.files), FG),
          statCell(t("panel.code.oversize"), String((h.oversize || []).length), (h.oversize || []).length ? WARN : FG),
          statCell(t("panel.code.lint"), String((h.lint && h.lint.total) || 0), (h.lint && h.lint.total) ? WARN : FG))
        : null,

      h && h.oversize && h.oversize.length
        ? e("div", { style: { display: "flex", flexDirection: "column", gap: 3 } },
          e("div", { style: { fontSize: 11, fontWeight: 600, color: FG2 } }, t("panel.code.oversize")),
          h.oversize.slice(0, 5).map(function (file) {
            return e("div", { key: file.path, style: { display: "flex", gap: 6, background: BG2, border: "1px solid " + BORDER, borderRadius: 8, padding: "5px 8px" } },
              e("span", { style: { fontSize: 10, fontFamily: MONO, color: FG3, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, file.path.split("/").pop()),
              e("span", { style: { fontSize: 10, color: FG2, flex: "0 0 auto" } }, file.lines + " 行"));
          }))
        : null,

      h && h.lint && h.lint.byRule && h.lint.byRule.length
        ? e("div", { style: { display: "flex", flexDirection: "column", gap: 3 } },
          e("div", { style: { fontSize: 11, fontWeight: 600, color: FG2 } }, t("panel.code.lint")),
          h.lint.byRule.slice(0, 6).map(function (entry) {
            return e("div", { key: entry.rule, style: { display: "flex", gap: 6, alignItems: "baseline" } },
              e("span", { style: { fontSize: 10.5, color: FG, flex: 1 } }, entry.rule),
              e("span", { style: { fontSize: 10, color: entry.severity === "Error" ? DANGER : FG3 } }, entry.count + " · " + entry.severity));
          }))
        : null,

      h && h.path
        ? e("div", { style: { fontSize: 8, fontFamily: MONO, color: FG3, wordBreak: "break-all", lineHeight: 1.4 } }, h.path)
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
    var [health, setHealth] = useState(null);
    var [healthBusy, setHealthBusy] = useState(false);
    var [version, setVersion] = useState("");
    var [reportError, setReportError] = useState("");
    var [diagnose, setDiagnose] = useState(null);
    var [diagnoseBusy, setDiagnoseBusy] = useState(false);
    var [diagnoses, setDiagnoses] = useState([]);
    var [diagTarget, setDiagTarget] = useState("");
    var [includeDevice, setIncludeDevice] = useState(false);

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
      void loadDiagnoses();
    }, []);

    function loadDiagnoses() {
      return rpc("diagnoses", { limit: 20 }).then(function (res) {
        if (res && res.ok && res.value) setDiagnoses(res.value.rows || []);
      });
    }

    function copyRecord(row) {
      var text = row.handoff || row.reportPath;
      setHandoff({ path: row.reportPath, text: text, copied: true });
      copyText(text);
    }

    useEffect(function () {
      rpc("info", {}).then(function (res) {
        if (res && res.ok && res.value) {
          setVersion(res.value.version || "");
          setDiagTarget(function (prev) {
            if (prev) return prev;
            try {
              return localStorage.getItem("diag.target") || "";
            } catch (e) {
              return "";
            }
          });
        }
      });
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

    function runDiagnose() {
      setDiagnoseBusy(true);
      setReportError("");
      var bundleId = serverTarget ? serverTarget.bundleId : undefined;
      rpc("diagnose", { bundleId: bundleId, target: diagTarget, includeDevice: includeDevice }).then(function (res) {
        setDiagnoseBusy(false);
        if (!res || !res.ok || !res.value) {
          setReportError((res && res.error && res.error.message) || "诊断失败");
          return;
        }
        setDiagnose(res.value);
        setReportPath(res.value.path || "");
        void loadRuns();
        void loadDiagnoses();
        if (res.value.handoff) {
          var text = res.value.handoff;
          setHandoff({ path: res.value.path || "", text: text, copied: false });
          copyText(text).then(function (ok) {
            setHandoff({ path: res.value.path || "", text: text, copied: ok });
          });
        }
      });
    }

    function reportNow() {
      setRunBusy(true);
      setReportError("");
      rpc("reportNow", {}).then(function (res) {
        setRunBusy(false);
        if (!res || !res.ok || !res.value) {
          setReportError((res && res.error && res.error.message) || "生成报告失败");
          return;
        }
        setReportPath(res.value.path || "");
        void loadRuns();
        if (res.value.handoff) {
          var text = res.value.handoff;
          setHandoff({ path: res.value.path || "", text: text, copied: false });
          copyText(text).then(function (ok) {
            setHandoff({ path: res.value.path || "", text: text, copied: ok });
          });
        }
      });
    }

    function copyCheckPath(run) {
      var path = run.dir + "/report.md";
      setReportPath(path);
      copyText(path);
    }

    function makeReport(run) {
      setRunBusy(true);
      setReportError("");
      // 不传 project/title：后端会从 run 的 meta.json 反推，比前端猜更准。
      var project = serverTarget && serverTarget.bundleId
        ? serverTarget.bundleId.split(".").pop()
        : undefined;
      rpc("report", { runId: run.runId, project: project }).then(function (res) {
        setRunBusy(false);
        if (!res || !res.ok || !res.value) {
          setReportError((res && res.error && res.error.message) || "生成报告失败");
          return;
        }
        setReportPath(res.value.path || "");
        if (!res.value.handoff) {
          setReportError("报告已生成，但没有交接文本");
          return;
        }
        var text = res.value.handoff;
        setHandoff({ path: res.value.path || "", text: text, copied: false });
        copyText(text).then(function (ok) {
          setHandoff({ path: res.value.path || "", text: text, copied: ok });
        });
      });
    }

    function scanCode() {
      setHealthBusy(true);
      rpc("health", { target: diagTarget }).then(function (res) {
        setHealthBusy(false);
        if (res && res.ok && res.value) setHealth(res.value);
      });
    }

    function runPreflightCheck() {
      setPreflightBusy(true);
      var bundleId = serverTarget ? serverTarget.bundleId : (pick ? pick.split("|")[1] : "");
      rpc("preflight", { bundleId: bundleId }).then(function (res) {
        setPreflightBusy(false);
        if (res && res.ok && res.value) {
          setPreflight(res.value);
          void loadRuns();
          if (res.value.handoff) {
            var text = res.value.handoff;
            setHandoff({ path: res.value.dir + "/report.md", text: text, copied: false });
            copyText(text).then(function (ok) {
              setHandoff({ path: res.value.dir + "/report.md", text: text, copied: ok });
            });
          }
        }
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
        e("span", { style: { flex: 1 } }),
        version ? e("span", { style: { fontSize: 9, fontFamily: MONO, color: FG3 } }, "v" + version) : null,
        e("button", {
          onClick: function () { window.location.reload(); },
          title: t("panel.reload"),
          style: { appearance: "none", border: 0, background: "transparent", color: FG3, fontSize: 12, cursor: "pointer", padding: "0 2px" }
        }, "↻")
      ),

      e("div", { style: { display: "flex", gap: 2, background: BG2, border: "1px solid " + BORDER, borderRadius: 10, padding: 3 } },
        ["overview", "memory", "records", "code", "catalog"].map(function (key) {
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
          onCopyPath: copyCheckPath,
          onReportNow: reportNow,
          diagnose: diagnose,
          diagnoseBusy: diagnoseBusy,
          onDiagnose: runDiagnose,
          diagTarget: diagTarget,
          diagTargets: diagnoses.map(function (row) { return row.target; }).filter(function (path, index, list) { return path && list.indexOf(path) === index; }),
          includeDevice: includeDevice,
          onTargetChange: function (value) {
            setDiagTarget(value);
            try { localStorage.setItem("diag.target", value); } catch (e) { /* 无痕模式 */ }
          },
          onToggleDevice: function (value) { setIncludeDevice(value); },
          diagnoses: diagnoses,
          onCopyRecord: copyRecord,
          busy: runBusy,
          canReport: samples.length > 0,
          handoff: handoff,
          reportError: reportError,
          onCopy: function () { if (handoff) copyText(handoff.text).then(function (ok) { setHandoff({ path: handoff.path, text: handoff.text, copied: ok }); }); },
        })
        : null,

      view === "code" ? e(CodeView, { t: t, health: health, busy: healthBusy, onScan: scanCode, target: diagTarget }) : null,

      view === "catalog" ? e(CatalogView, { t: t, catalog: catalog }) : null,

      view === "records"
        ? e(RecordsView, {
          t: t,
          runs: runs,
          clock: shortClock,
          onReport: makeReport,
          onCopyPath: copyCheckPath,
          onReportNow: reportNow,
          diagnose: diagnose,
          diagnoseBusy: diagnoseBusy,
          onDiagnose: runDiagnose,
          diagnoses: diagnoses,
          onCopyRecord: copyRecord,
          busy: runBusy,
          canReport: samples.length > 0,
          onExport: exportRun,
          reportError: reportError,
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
