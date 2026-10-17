#!/usr/bin/env bash
# PreToolUse hook (.claude/settings.json): graphify's own guard, which reminds
# Claude to ask the graph before a raw search or read. Committed hooks must
# work everywhere, so with no graphify or no graph yet it does nothing.
export PATH="$HOME/.local/bin:$PATH"
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
if ! command -v graphify >/dev/null 2>&1 || [ ! -s graphify-out/graph.json ]; then
  cat >/dev/null
  exit 0
fi
exec graphify hook-guard "${1:-search}"
