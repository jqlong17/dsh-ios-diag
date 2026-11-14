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
