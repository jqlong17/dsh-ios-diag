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
