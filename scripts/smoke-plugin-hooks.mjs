#!/usr/bin/env node
/**
 * Smoke the published server + TUI entries the way OpenCode's v1 loader does:
 * default-export PluginModule shape (server XOR tui), tool.execute hooks, /hypa.
 *
 * Requires `npm run build` first. Does not need the OpenCode CLI.
 *
 * Usage:
 *   node scripts/smoke-plugin-hooks.mjs [packageDir]
 */
import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const root = process.argv[2]
  ? join(process.cwd(), process.argv[2])
  : join(dirname(fileURLToPath(import.meta.url)), "..")

function exportPath(pkg, key) {
  const exp = pkg.exports?.[key]
  const entry = typeof exp === "string" ? exp : exp?.import
  if (!entry) throw new Error(`missing package exports['${key}']`)
  return join(root, entry)
}

function assertV1Shape(mod, kind) {
  const value = mod.default
  if (!value || typeof value !== "object") {
    throw new Error(`${kind} default export must be an object`)
  }
  if (kind === "server") {
    if (typeof value.server !== "function") throw new Error("missing server()")
    if ("tui" in value) throw new Error("server module must not export tui")
  } else {
    if (typeof value.tui !== "function") throw new Error("missing tui()")
    if ("server" in value) throw new Error("tui module must not export server")
  }
  return value
}

const pkg = require(join(root, "package.json"))
const fakeHypa = join(root, "test/fixtures/fake-hypa-rewrite.js")
if (!existsSync(fakeHypa)) throw new Error(`missing fixture ${fakeHypa}`)

const serverUrl = pathToFileURL(exportPath(pkg, "./server")).href
const tuiUrl = pathToFileURL(exportPath(pkg, "./tui")).href

const serverMod = await import(serverUrl)
const server = assertV1Shape(serverMod, "server")
const hooks = await server.server({}, { binary: fakeHypa })

assert.equal(typeof hooks["tool.execute.before"], "function")
assert.equal(typeof hooks["tool.execute.after"], "function")

const callID = "smoke-hooks"
const before = { args: { command: "git status" } }
await hooks["tool.execute.before"]({ tool: "bash", callID, sessionID: "smoke" }, before)
assert.equal(before.args.command, "hypa git status")

const after = { title: "git status", output: "On branch main", metadata: {} }
await hooks["tool.execute.after"]({ tool: "bash", callID, sessionID: "smoke" }, after)
assert.match(String(after.title), /\[hypa Rewritten]/)
assert.match(String(after.output), /\[hypa Rewritten]/)
assert.equal(after.metadata.hypaRewrite?.outcome, "Rewritten")

const tuiMod = await import(tuiUrl)
const tui = assertV1Shape(tuiMod, "tui")
const layers = []
await tui.tui(
  {
    keymap: {
      registerLayer(layer) {
        layers.push(layer)
      },
    },
    ui: {
      DialogAlert: () => null,
      dialog: { replace() {}, clear() {} },
    },
  },
  undefined,
  { id: "opencode-hypa", state: "first" },
)

const commands = layers.flatMap((layer) => layer.commands ?? [])
const hypa = commands.find((command) => command.slashName === "hypa")
assert.ok(hypa, "tui() must register slashName 'hypa'")

console.log(
  JSON.stringify(
    {
      ok: true,
      serverEntry: exportPath(pkg, "./server"),
      tuiEntry: exportPath(pkg, "./tui"),
      rewritten: before.args.command,
      slashName: hypa.slashName,
    },
    null,
    2,
  ),
)
