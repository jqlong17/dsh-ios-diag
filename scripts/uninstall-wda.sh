#!/usr/bin/env bash
# 卸载真机上的 WebDriverAgent，并清掉本机构建缓存。
#
# 为什么：WDA 的 XCTest 会话会接管输入事件，系统键盘常常弹不出来（2026-11-14 实锤）。
# 真机自动化做完就删，不要让它常驻。
#
#   ./scripts/uninstall-wda.sh [udid]
set -uo pipefail

BUNDLE="com.facebook.WebDriverAgentRunner.xctrunner"
UDID="${1:-}"

if [[ -z "$UDID" ]]; then
  UDID=$(xcrun devicectl list devices 2>/dev/null | awk '/available \(paired\)/ {print $(NF-1)}' | head -1)
fi
if [[ -z "$UDID" ]]; then
  echo "没找到已连接的真机；插上 USB 或确认已配对后重试" >&2
  exit 1
fi

echo "设备：$UDID"
if xcrun devicectl device info apps --device "$UDID" 2>/dev/null | grep -q "$BUNDLE"; then
  xcrun devicectl device uninstall app --device "$UDID" "$BUNDLE" || exit 1
else
  echo "设备上没有 WDA，跳过"
fi

rm -rf "$HOME/Library/Developer/Xcode/DerivedData/WebDriverAgent-"* 2>/dev/null
echo "已清理本机构建缓存"
