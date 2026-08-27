#!/usr/bin/env bash
# Load this package through OpenCode's real plugin loader (headless `opencode serve`).
# OpenCode instantiates the v1 PluginModule; the wrapper then drives tool.execute.*
# so we notice loader/export-shape breakage, not just TypeScript drift.
#
# Requires: opencode on PATH, npm, curl. Set SMOKE_REQUIRE_CLI=1 to fail (not skip)
# when the CLI is missing.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${SMOKE_PORT:-14096}"
WORKDIR="$(mktemp -d)"
MARKER="$WORKDIR/loaded.json"
SERVE_PID=""

cleanup() {
  if [ -n "${SERVE_PID}" ]; then
    kill "${SERVE_PID}" 2>/dev/null || true
    wait "${SERVE_PID}" 2>/dev/null || true
  fi
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

if ! command -v opencode >/dev/null 2>&1; then
  if [ "${SMOKE_REQUIRE_CLI:-}" = "1" ]; then
    echo "FAIL: opencode CLI required but not on PATH" >&2
    exit 1
  fi
  echo "SKIP: opencode CLI not installed"
  exit 0
fi

echo "==> OpenCode $(opencode --version 2>/dev/null || echo unknown)"

echo "==> building and packing opencode-hypa"
cd "$ROOT"
npm run -s build
PACK_OUT="$(npm pack --pack-destination "$WORKDIR" --silent | tail -1)"
TARBALL="$WORKDIR/$PACK_OUT"
if [ ! -f "$TARBALL" ]; then
  # npm pack --silent may print a bare filename or an absolute path.
  if [ -f "$PACK_OUT" ]; then
    TARBALL="$PACK_OUT"
  else
    TARBALL="$(find "$WORKDIR" -maxdepth 1 -name 'opencode-hypa-*.tgz' | head -1)"
  fi
fi
if [ ! -f "$TARBALL" ]; then
  echo "FAIL: npm pack did not produce a tarball" >&2
  exit 1
fi

echo "==> throwaway project in $WORKDIR"
cd "$WORKDIR"
git init -q .
npm init -y >/dev/null
npm install --silent "$TARBALL"

HYPA_BIN="$(find "$WORKDIR/node_modules" -path '*/@hypabolic/hypa-*/bin/hypa' -type f | head -1)"
if [ -z "$HYPA_BIN" ] && [ -x "$WORKDIR/node_modules/.bin/hypa" ]; then
  HYPA_BIN="$WORKDIR/node_modules/.bin/hypa"
fi
if [ -z "$HYPA_BIN" ]; then
  echo "FAIL: packed plugin did not install a hypa binary" >&2
  ls -la "$WORKDIR/node_modules/@hypabolic" >&2 || true
  exit 1
fi
echo "==> hypa binary $HYPA_BIN"

export HYPA_SMOKE_MARKER="$MARKER"
# Use a real hypa binary. OpenCode's process.execPath is the CLI (not Node),
# so the test suite's .js fake-hypa fixture cannot be spawned from inside serve.
export HYPA_SMOKE_BIN="$HYPA_BIN"
export PATH="$(dirname "$HYPA_BIN"):$WORKDIR/node_modules/.bin:${PATH:-}"

mkdir -p .opencode/plugins
cat > .opencode/plugins/hypa-smoke.js <<'EOF'
import hypa from "opencode-hypa"
import { writeFileSync } from "node:fs"

const marker = process.env.HYPA_SMOKE_MARKER
const binary = process.env.HYPA_SMOKE_BIN

export default {
  id: "opencode-hypa-smoke",
  async server(input, options) {
    const hooks = await hypa.server(input, { binary, ...(options ?? {}) })
    const before = { args: { command: "git status" } }
    await hooks["tool.execute.before"](
      { tool: "bash", callID: "smoke-loader", sessionID: "smoke-loader" },
      before,
    )
    writeFileSync(
      marker,
      JSON.stringify({
        loaded: true,
        hooks: Object.keys(hooks ?? {}),
        command: before.args.command,
      }),
    )
    return hooks
  },
}
EOF

cat > opencode.json <<EOF
{
  "\$schema": "https://opencode.ai/config.json"
}
EOF

export OPENCODE_DISABLE_AUTOUPDATE=1
export OPENCODE_DISABLE_DEFAULT_PLUGINS=1

echo "==> starting opencode serve on port $PORT"
opencode serve --port "$PORT" --hostname 127.0.0.1 >"$WORKDIR/serve.log" 2>&1 &
SERVE_PID=$!

ready=0
for _ in $(seq 1 60); do
  if curl -fsS -m 2 "http://127.0.0.1:${PORT}/global/health" >/dev/null 2>&1; then
    ready=1
    break
  fi
  if ! kill -0 "$SERVE_PID" 2>/dev/null; then
    echo "FAIL: opencode serve exited before becoming healthy" >&2
    cat "$WORKDIR/serve.log" >&2 || true
    exit 1
  fi
  sleep 1
done
if [ "$ready" != "1" ]; then
  echo "FAIL: opencode serve never became healthy" >&2
  cat "$WORKDIR/serve.log" >&2 || true
  exit 1
fi

# Plugin loading is instance-scoped; a project request triggers it.
curl -sS -m 30 "http://127.0.0.1:${PORT}/config?directory=${WORKDIR}" >/dev/null || true
curl -sS -m 30 "http://127.0.0.1:${PORT}/session?directory=${WORKDIR}" >/dev/null || true
curl -sS -m 30 "http://127.0.0.1:${PORT}/project/current?directory=${WORKDIR}" >/dev/null || true

for _ in $(seq 1 60); do
  [ -f "$MARKER" ] && break
  if ! kill -0 "$SERVE_PID" 2>/dev/null; then
    echo "FAIL: opencode serve exited before the plugin loaded" >&2
    cat "$WORKDIR/serve.log" >&2 || true
    exit 1
  fi
  sleep 1
done

if [ ! -f "$MARKER" ]; then
  echo "FAIL: plugin never loaded (no marker after 60s)" >&2
  cat "$WORKDIR/serve.log" >&2 || true
  exit 1
fi

if ! node --input-type=module <<'NODE'
import { readFileSync } from "node:fs"
const marker = process.env.HYPA_SMOKE_MARKER
const data = JSON.parse(readFileSync(marker, "utf8"))
if (!data.loaded) {
  console.error("FAIL: marker loaded=false", data)
  process.exit(1)
}
const hooks = data.hooks ?? []
for (const name of ["tool.execute.before", "tool.execute.after"]) {
  if (!hooks.includes(name)) {
    console.error(`FAIL: missing hook ${name}`, data)
    process.exit(1)
  }
}
if (typeof data.command !== "string" || !data.command.startsWith("hypa ")) {
  console.error("FAIL: expected a hypa-rewritten command, got", data.command)
  process.exit(1)
}
console.log("==> loader smoke ok", JSON.stringify(data))
NODE
then
  echo "FAIL: rewrite/hook assertion failed; serve log:" >&2
  cat "$WORKDIR/serve.log" >&2 || true
  exit 1
fi

echo "PASS: OpenCode loader smoke"
