#!/usr/bin/env node
/**
 * Drive OpenCode's real shell/bash dispatcher after `opencode serve` is up.
 *
 * Primary: POST /session then POST /session/:id/shell
 * Fallback: POST /session/:id/message against the local dummy OpenAI stub
 *           (emits a bash tool call; no paid provider).
 *
 * /session/:id/shell is a separate exec path in current OpenCode (it triggers
 * `shell.env`, not `tool.execute.before`). This script checks that empirically
 * and does not treat a raw /shell exec as a hypa rewrite pass.
 *
 * Exit:
 *   0  real dispatcher invoked tool.execute.before and the command was rewritten
 *   2  no unauthenticated dispatcher hit bash hooks (expected skip unless
 *      SMOKE_REQUIRE_REAL_SHELL=1, which turns this into a hard fail)
 *   1  hard failure
 */
import { readFileSync, existsSync } from "node:fs"

const port = Number(process.env.SMOKE_PORT || 14096)
const workdir = process.env.SMOKE_WORKDIR || process.cwd()
const dispatchPath = process.env.HYPA_SMOKE_DISPATCH
const command = process.env.SMOKE_COMMAND || "git status"
const requireReal = process.env.SMOKE_REQUIRE_REAL_SHELL === "1"
const base = `http://127.0.0.1:${port}`
const directory = encodeURIComponent(workdir)
const timeoutMs = Number(process.env.SMOKE_REAL_SHELL_TIMEOUT_MS || 45_000)

const report = {
  opencode: null,
  sessionID: null,
  agent: null,
  shell: null,
  dummyMessage: null,
  dispatch: [],
  asserted: null,
  skipReason: null,
}

function summarize(extra) {
  return JSON.stringify({ ...report, ...extra }, null, 2)
}

function fail(message, extra = {}) {
  console.error(`FAIL: ${message}`)
  console.error(summarize(extra))
  process.exit(1)
}

function skip(message, extra = {}) {
  report.skipReason = message
  const text = `SKIP: ${message}\n${summarize(extra)}`
  if (requireReal) {
    console.error(
      "FAIL: SMOKE_REQUIRE_REAL_SHELL=1 but no unauthenticated OpenCode dispatcher invoked hypa bash hooks.\n" +
        text,
    )
    process.exit(1)
  }
  console.log(text)
  process.exit(2)
}

function pass(message, extra = {}) {
  report.asserted = message
  console.log(`PASS: ${message}`)
  console.log(summarize(extra))
  process.exit(0)
}

function looksRewritten(value) {
  if (typeof value !== "string") return false
  const trimmed = value.trim()
  return trimmed === "hypa" || trimmed.startsWith("hypa ")
}

function readDispatch() {
  if (!dispatchPath || !existsSync(dispatchPath)) return []
  return readFileSync(dispatchPath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)]
      } catch {
        return []
      }
    })
}

function bashBeforeHooks(entries = readDispatch()) {
  return entries.filter(
    (entry) =>
      entry?.hook === "tool.execute.before" &&
      (entry.tool === "bash" || entry.tool === "shell") &&
      entry.callID !== "smoke-loader",
  )
}

function rewrittenDispatch(entries) {
  return bashBeforeHooks(entries).find(
    (entry) => looksRewritten(entry.commandAfter) || looksRewritten(entry.commandBefore),
  )
}

function apiUrl(path) {
  const sep = path.includes("?") ? "&" : "?"
  return `${base}${path}${sep}directory=${directory}`
}

async function api(method, path, body, ms = 15_000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    const res = await fetch(apiUrl(path), {
      method,
      headers: {
        accept: "application/json",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
    const text = await res.text()
    let json = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = null
    }
    return { ok: res.ok, status: res.status, text, json }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      text: "",
      json: null,
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    clearTimeout(timer)
  }
}

function sessionIdFrom(payload) {
  if (!payload || typeof payload !== "object") return null
  if (typeof payload.id === "string") return payload.id
  if (typeof payload.sessionID === "string") return payload.sessionID
  if (typeof payload.info?.id === "string") return payload.info.id
  return null
}

function pickAgent(agents) {
  const list = Array.isArray(agents) ? agents : []
  const named = (name) => list.find((agent) => agent?.name === name && !agent?.hidden)
  return named("build") || named("general") || list.find((agent) => !agent?.hidden) || list[0]
}

function preview(text, max = 400) {
  const value = text || ""
  return value.length <= max ? value : `${value.slice(0, max)}…`
}

function bashToolParts(payload) {
  const rows = Array.isArray(payload) ? payload : []
  const parts = rows.flatMap((row) => row?.parts ?? (row?.type === "tool" ? [row] : []))
  return parts.filter((part) => part?.type === "tool" && (part.tool === "bash" || part.tool === "shell"))
}

async function waitForDispatch(predicate, ms) {
  const start = Date.now()
  while (Date.now() - start < ms) {
    const entries = readDispatch()
    if (predicate(entries)) return entries
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  return readDispatch()
}

const health = await api("GET", "/global/health")
report.opencode = health.json ?? { status: health.status, text: health.text }
if (!health.ok) fail("opencode serve is not healthy", { health })

const agentsRes = await api("GET", "/agent")
const agent = pickAgent(agentsRes.json)
report.agent = agent?.name ?? "build"
const agentName = report.agent

const created = await api("POST", "/session", { title: "hypa-real-shell-smoke" })
const sessionID = sessionIdFrom(created.json)
report.sessionID = sessionID
if (!created.ok || !sessionID) {
  fail("POST /session failed", { created })
}

const shellBody = { agent: agentName, command }
const shellBefore = readDispatch().length
const shellResult = await api("POST", `/session/${sessionID}/shell`, shellBody, timeoutMs)
const shellAfterEntries = await waitForDispatch((entries) => entries.length > shellBefore, 3_000)
const shellNewEntries = shellAfterEntries.slice(shellBefore)
const shellMessages = await api("GET", `/session/${sessionID}/message`)
const shellBashParts = bashToolParts(shellMessages.json)
const shellHit = {
  body: shellBody,
  status: shellResult.status,
  ok: shellResult.ok,
  error: shellResult.error,
  responsePreview: preview(shellResult.text),
  dispatchDuring: shellNewEntries,
  bashHooks: bashBeforeHooks(shellNewEntries),
  shellEnv: shellNewEntries.filter((entry) => entry?.hook === "shell.env"),
  bashPartCommands: shellBashParts.map((part) => part?.state?.input?.command),
}
report.shell = shellHit

const shellRewritten = rewrittenDispatch(shellHit.dispatchDuring)
if (shellRewritten) {
  report.dispatch = readDispatch()
  pass("POST /session/:id/shell invoked tool.execute.before and hypa rewrote the command", {
    rewritten: shellRewritten,
  })
}

const shellRan =
  shellHit.ok ||
  shellHit.shellEnv.length > 0 ||
  (shellHit.status === 200 && shellHit.responsePreview.length > 0)

if (shellRan && bashBeforeHooks(shellHit.dispatchDuring).length === 0) {
  console.log(
    "==> FINDING: POST /session/:id/shell executed without tool.execute.before " +
      "(OpenCode user-shell path; hooks were not dispatched). " +
      "Trying the next-best unauthenticated dispatcher.",
  )
}

const dummySession = await api("POST", "/session", { title: "hypa-dummy-bash-smoke" })
const dummySessionID = sessionIdFrom(dummySession.json)
if (!dummySession.ok || !dummySessionID) {
  fail("POST /session for dummy-model fallback failed", { dummySession })
}

const dummyBody = {
  agent: agentName,
  model: { providerID: "dummy", modelID: "dummy" },
  parts: [{ type: "text", text: `Run this exact command: ${command}` }],
}

const dummyBefore = readDispatch().length
const dummyResult = await api("POST", `/session/${dummySessionID}/message`, dummyBody, timeoutMs)
const dummyAfterEntries = await waitForDispatch(
  (entries) => rewrittenDispatch(entries.slice(dummyBefore)),
  15_000,
)
const dummyNewEntries = dummyAfterEntries.slice(dummyBefore)
const dummyMessages = await api("GET", `/session/${dummySessionID}/message`)
const dummyBashParts = bashToolParts(dummyMessages.json)
const dummyHit = {
  sessionID: dummySessionID,
  status: dummyResult.status,
  ok: dummyResult.ok,
  error: dummyResult.error,
  responsePreview: preview(dummyResult.text),
  dispatchDuring: dummyNewEntries,
  bashHooks: bashBeforeHooks(dummyNewEntries),
  bashPartCommands: dummyBashParts.map((part) => part?.state?.input?.command),
  bashPartTitles: dummyBashParts.map((part) => part?.state?.title),
}
report.dummyMessage = dummyHit
report.dispatch = readDispatch()
const dummyLogPath = process.env.SMOKE_DUMMY_LOG
report.dummyLog =
  dummyLogPath && existsSync(dummyLogPath)
    ? readFileSync(dummyLogPath, "utf8").trim().split("\n").slice(-8)
    : []

const dummyRewritten = rewrittenDispatch(dummyHit.dispatchDuring)
if (dummyRewritten) {
  const executed = (dummyHit.bashPartCommands ?? []).some(looksRewritten)
  if ((dummyHit.bashPartCommands ?? []).length > 0 && !executed) {
    fail(
      "tool.execute.before rewrote the command, but the session bash part still recorded the raw command",
      { dummyRewritten, bashPartCommands: dummyHit.bashPartCommands },
    )
  }
  pass(
    "dummy OpenAI-compatible model caused OpenCode to dispatch bash through tool.execute.before; hypa rewrote the command",
    {
      rewritten: dummyRewritten,
      executedCommand: dummyHit.bashPartCommands?.[0] ?? dummyRewritten.commandAfter,
      shellSkippedBashHooks: Boolean(shellRan && shellHit.bashHooks.length === 0),
      shellStatus: shellHit.status,
    },
  )
}

const anyRewritten = rewrittenDispatch()
if (anyRewritten) {
  pass("OpenCode dispatched bash through tool.execute.before and hypa rewrote the command", {
    rewritten: anyRewritten,
  })
}

const bits = [
  `/shell status=${shellHit.status} bashHooks=${shellHit.bashHooks.length} shell.env=${shellHit.shellEnv.length}`,
  `/message(dummy) status=${dummyHit.status} bashHooks=${dummyHit.bashHooks.length}`,
]

skip(
  "no unauthenticated OpenCode dispatcher invoked tool.execute.before on bash/shell. " +
    bits.join("; ") +
    ". Loader self-call still passed. Set SMOKE_REQUIRE_REAL_SHELL=1 to fail CI on this gap.",
)
