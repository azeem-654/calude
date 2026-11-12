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
# - In a cloud session a watcher (`graphify watch`) then keeps the graph in
#   step with edits made during the session (~40 s after a save, AST only,
#   idle at 0% CPU). Not on a developer's machine: a nohup'd watcher would
#   outlive the session there; set GRAPHIFY_WATCH=1 to opt in.
# - The `/graphify` command (graphify's own skill) is installed for the owner
#   to type, marked disable-model-invocation: its 47 KB SKILL.md says "use for
#   any question about a codebase", and left model-invocable Claude would load
#   ~12k tokens of it on its own instead of running the cheap CLI query.
# - Nothing here may stop a session: every failure says "unavailable" and
#   exits 0.
set -u
cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}" || exit 0
export PATH="$HOME/.local/bin:$PATH"

cloud=""
{ [ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || [ "${GRAPHIFY_AUTO_INSTALL:-}" = "1" ]; } && cloud=1

# The extras matter: [sql] puts the 90-odd D1 migrations (every table) in the
# graph — without it they are skipped with a warning — and [watch] is what
# `graphify watch` imports. An install missing either is redone with them.
has_extras() {
  local py; py="$(head -1 "$(command -v graphify)" 2>/dev/null | sed 's/^#!//')"
  [ -x "$py" ] && "$py" -c 'import watchdog, tree_sitter_sql' >/dev/null 2>&1
}
if command -v graphify >/dev/null 2>&1 && { has_extras || [ -z "$cloud" ]; }; then
  tool="ready"
elif [ -n "$cloud" ]; then
  # uv is in the cloud image; pipx and pip --user are the fallbacks.
  pkg='graphifyy[sql,watch]'
  if { command -v uv >/dev/null 2>&1 && timeout 120 uv tool install -q --force "$pkg" >/dev/null 2>&1; } \
    || { command -v pipx >/dev/null 2>&1 && timeout 120 pipx install --force "$pkg" >/dev/null 2>&1; } \
    || timeout 120 python3 -m pip install -q --user "$pkg" >/dev/null 2>&1; then
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

skill="$HOME/.claude/skills/graphify/SKILL.md"
if [ -n "$cloud" ] && [ ! -s "$skill" ]; then
  timeout 60 graphify install --platform claude >/dev/null 2>&1
fi
if [ -s "$skill" ] && ! grep -q '^disable-model-invocation:' "$skill"; then
  sed -i '0,/^description:/s//disable-model-invocation: true\n&/' "$skill"
fi
[ -s "$skill" ] && echo "Graphify: /graphify command installed (owner-typed only)"

mkdir -p graphify-out
# One build, one watcher: SessionStart also fires on resume, /clear and after
# a compact, and the graph must not be written by two processes at once.
alive() { [ -e "$1" ] && kill -0 "$(cat "$1" 2>/dev/null)" 2>/dev/null; }
if alive graphify-out/.watch.pid; then
  echo "Graph: live (watcher keeping it current)"
  exit 0
fi
if alive graphify-out/.bootstrap.lock; then
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
# The watcher starts only after the update, and `exec` keeps the pid that
# .watch.pid records.
watch=""
{ [ -n "$cloud" ] || [ "${GRAPHIFY_WATCH:-}" = "1" ]; } && watch=1
WATCH="$watch" nohup bash -c 'echo $$ > graphify-out/.bootstrap.lock
graphify update . > graphify-out/.bootstrap.log 2>&1
rm -f graphify-out/.bootstrap.lock
[ -n "$WATCH" ] || exit 0
echo $$ > graphify-out/.watch.pid
exec graphify watch . > graphify-out/.watch.log 2>&1' >/dev/null 2>&1 &
echo "Graph: $state${watch:+, then kept live by a watcher}"
exit 0
