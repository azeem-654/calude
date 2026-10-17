#!/usr/bin/env bash
# Make graphify (the code knowledge graph Claude queries before searching —
# see "graphify" in CLAUDE.md) ready in this container. Run by the SessionStart
# hook in .claude/settings.json; safe to run by hand any number of times.
#
# - graphify is installed only when missing, and only in a cloud session
#   (CLAUDE_CODE_REMOTE=true): a cloud container starts fresh, a developer's
#   own machine is theirs to install things on.
# - The graph is built only when graphify-out/graph.json is missing, otherwise
#   brought up to date incrementally (`graphify update`, AST only — no AI
#   calls, no tokens). Either runs in the background, so a session never
#   waits for it; until it finishes, searching works as it always did.
# - Nothing here may stop a session: every failure says "unavailable" and
#   exits 0.
set -u
cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}" || exit 0
export PATH="$HOME/.local/bin:$PATH"

if command -v graphify >/dev/null 2>&1; then
  tool="ready"
elif [ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || [ "${GRAPHIFY_AUTO_INSTALL:-}" = "1" ]; then
  # uv is in the cloud image; pipx and pip --user are the fallbacks.
  if { command -v uv >/dev/null 2>&1 && timeout 120 uv tool install -q graphifyy >/dev/null 2>&1; } \
    || { command -v pipx >/dev/null 2>&1 && timeout 120 pipx install graphifyy >/dev/null 2>&1; } \
    || timeout 120 python3 -m pip install -q --user graphifyy >/dev/null 2>&1; then
    hash -r
    command -v graphify >/dev/null 2>&1 && tool="installed" || tool="unavailable"
  else
    tool="unavailable"
  fi
else
  tool="unavailable"
fi

if [ "$tool" = "unavailable" ] || ! graphify --version >/dev/null 2>&1; then
  echo "Graphify: unavailable — searching the code as usual"
  exit 0
fi
echo "Graphify: $tool ($(graphify --version 2>/dev/null))"

mkdir -p graphify-out
# One build at a time: SessionStart also fires on resume and after a compact.
if [ -e graphify-out/.bootstrap.lock ] && kill -0 "$(cat graphify-out/.bootstrap.lock 2>/dev/null)" 2>/dev/null; then
  echo "Graph: already being prepared"
  exit 0
fi
if [ -s graphify-out/graph.json ]; then
  state="ready (updating changed files in the background)"
else
  state="building in the background (~2 min, no AI calls)"
fi
# `graphify update .` builds from nothing when there is no graph, and
# re-extracts only changed files when there is one; .graphifyignore applies.
nohup bash -c 'echo $$ > graphify-out/.bootstrap.lock; graphify update . > graphify-out/.bootstrap.log 2>&1; rm -f graphify-out/.bootstrap.lock' >/dev/null 2>&1 &
echo "Graph: $state"
exit 0
