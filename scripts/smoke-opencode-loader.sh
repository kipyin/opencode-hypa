#!/usr/bin/env bash
# Load this package through OpenCode's real plugin loader (headless `opencode serve`).
# OpenCode instantiates the v1 PluginModule; the wrapper then drives tool.execute.*
# so we notice loader/export-shape breakage, not just TypeScript drift.
#
# After the loader self-call, scripts/smoke-opencode-real-shell.mjs drives
# POST /session/:id/shell (and a dummy-model bash tool fallback) so CI notices
# if OpenCode stops dispatching tool.execute.before on a real shell path.
#
# Requires: opencode on PATH, npm, curl, node. Set SMOKE_REQUIRE_CLI=1 to fail
# (not skip) when the CLI is missing. Set SMOKE_REQUIRE_REAL_SHELL=1 to fail
# when no unauthenticated OpenCode dispatcher hits hypa bash hooks.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${SMOKE_PORT:-14096}"
DUMMY_PORT="${SMOKE_DUMMY_PORT:-14197}"
WORKDIR="$(mktemp -d)"
MARKER="$WORKDIR/loaded.json"
DISPATCH="$WORKDIR/dispatch.jsonl"
SERVE_PID=""
DUMMY_PID=""

cleanup() {
  if [ -n "${SERVE_PID}" ]; then
    kill "${SERVE_PID}" 2>/dev/null || true
    wait "${SERVE_PID}" 2>/dev/null || true
  fi
  if [ -n "${DUMMY_PID}" ]; then
    kill "${DUMMY_PID}" 2>/dev/null || true
    wait "${DUMMY_PID}" 2>/dev/null || true
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
export HYPA_SMOKE_DISPATCH="$DISPATCH"
# Use a real hypa binary. OpenCode's process.execPath is the CLI (not Node),
# so the test suite's .js fake-hypa fixture cannot be spawned from inside serve.
export HYPA_SMOKE_BIN="$HYPA_BIN"
export PATH="$(dirname "$HYPA_BIN"):$WORKDIR/node_modules/.bin:${PATH:-}"
: > "$DISPATCH"

mkdir -p .opencode/plugins
cat > .opencode/plugins/hypa-smoke.js <<'EOF'
import hypa from "opencode-hypa"
import { appendFileSync, writeFileSync } from "node:fs"

const marker = process.env.HYPA_SMOKE_MARKER
const dispatch = process.env.HYPA_SMOKE_DISPATCH
const binary = process.env.HYPA_SMOKE_BIN

function record(entry) {
  if (!dispatch) return
  appendFileSync(dispatch, `${JSON.stringify({ at: Date.now(), ...entry })}\n`)
}

function wrap(hooks) {
  const origBefore = hooks["tool.execute.before"]
  const origAfter = hooks["tool.execute.after"]
  const origEnv = hooks["shell.env"]
  hooks["tool.execute.before"] = async (input, output) => {
    const commandBefore = output?.args?.command
    const result = await origBefore?.(input, output)
    if (input?.callID !== "smoke-loader") {
      record({
        hook: "tool.execute.before",
        tool: input?.tool,
        callID: input?.callID,
        sessionID: input?.sessionID,
        commandBefore,
        commandAfter: output?.args?.command,
      })
    }
    return result
  }
  hooks["tool.execute.after"] = async (input, output) => {
    const result = await origAfter?.(input, output)
    if (input?.callID !== "smoke-loader") {
      record({
        hook: "tool.execute.after",
        tool: input?.tool,
        callID: input?.callID,
        sessionID: input?.sessionID,
        title: output?.title,
        rewritten: Boolean(output?.metadata?.hypaRewrite),
      })
    }
    return result
  }
  // /session/:id/shell currently triggers shell.env instead of bash hooks.
  // Record it so the real-shell smoke can report that path honestly.
  hooks["shell.env"] = async (input, output) => {
    record({
      hook: "shell.env",
      cwd: input?.cwd,
      callID: input?.callID,
      sessionID: input?.sessionID,
    })
    if (typeof origEnv === "function") return origEnv(input, output)
    return output
  }
  return hooks
}

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
    return wrap(hooks ?? {})
  },
}
EOF

cat > opencode.json <<EOF
{
  "\$schema": "https://opencode.ai/config.json",
  "model": "dummy/dummy",
  "permission": "allow",
  "provider": {
    "dummy": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Hypa smoke dummy",
      "options": {
        "baseURL": "http://127.0.0.1:${DUMMY_PORT}/v1",
        "apiKey": "dummy"
      },
      "models": {
        "dummy": {
          "name": "Dummy",
          "tool_call": true
        }
      }
    }
  }
}
EOF

export OPENCODE_DISABLE_AUTOUPDATE=1
export OPENCODE_DISABLE_DEFAULT_PLUGINS=1
export SMOKE_DUMMY_PORT="$DUMMY_PORT"
export SMOKE_DUMMY_LOG="$WORKDIR/dummy.log"
export SMOKE_PORT="$PORT"
export SMOKE_WORKDIR="$WORKDIR"

echo "==> starting dummy OpenAI-compatible provider on port $DUMMY_PORT"
node "$ROOT/scripts/smoke-dummy-openai.mjs" >"$WORKDIR/dummy.stdout" 2>"$WORKDIR/dummy.stderr" &
DUMMY_PID=$!
dummy_ready=0
for _ in $(seq 1 30); do
  if curl -fsS -m 1 "http://127.0.0.1:${DUMMY_PORT}/health" >/dev/null 2>&1; then
    dummy_ready=1
    break
  fi
  if ! kill -0 "$DUMMY_PID" 2>/dev/null; then
    echo "FAIL: dummy OpenAI stub exited before becoming healthy" >&2
    cat "$WORKDIR/dummy.stderr" >&2 || true
    exit 1
  fi
  sleep 0.2
done
if [ "$dummy_ready" != "1" ]; then
  echo "FAIL: dummy OpenAI stub never became healthy" >&2
  cat "$WORKDIR/dummy.stderr" >&2 || true
  exit 1
fi

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

echo "==> driving OpenCode real shell/bash dispatcher"
set +e
node "$ROOT/scripts/smoke-opencode-real-shell.mjs"
real_status=$?
set -e
if [ "$real_status" -eq 0 ]; then
  echo "PASS: OpenCode real shell/bash dispatcher smoke"
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    echo "- real dispatcher: **pass** (hypa rewrite observed on OpenCode-dispatched bash/shell)" >> "$GITHUB_STEP_SUMMARY"
  fi
elif [ "$real_status" -eq 2 ]; then
  echo "WARN: OpenCode real shell/bash dispatcher did not hit hypa hooks (expected skip unless SMOKE_REQUIRE_REAL_SHELL=1)"
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    echo "- real dispatcher: **skipped** (no unauthenticated bash hook path; see smoke log)" >> "$GITHUB_STEP_SUMMARY"
  fi
  if [ "${SMOKE_VERBOSE:-}" = "1" ]; then
    cat "$WORKDIR/serve.log" >&2 || true
    cat "$WORKDIR/dummy.stderr" >&2 || true
  fi
else
  echo "FAIL: OpenCode real shell/bash dispatcher smoke" >&2
  cat "$WORKDIR/serve.log" >&2 || true
  cat "$WORKDIR/dummy.stderr" >&2 || true
  cat "$DISPATCH" >&2 || true
  exit "$real_status"
fi
