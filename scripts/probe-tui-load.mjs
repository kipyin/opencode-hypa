#!/usr/bin/env bun
/**
 * Mimic OpenCode's TUI plugin loader against a package directory.
 * Exit 0 only if import succeeds and tui() registers slashName "hypa".
 *
 * Usage:
 *   bun scripts/probe-tui-load.mjs [packageDir]
 */
import { pathToFileURL } from "node:url"
import path from "node:path"
import { readFileSync } from "node:fs"

const pkgDir =
  process.argv[2] ??
  "/Users/kip/.cache/opencode/packages/opencode-hypa@1.0.2/node_modules/opencode-hypa"

const pkg = JSON.parse(readFileSync(path.join(pkgDir, "package.json"), "utf8"))
const exp = pkg.exports?.["./tui"]
const entry = typeof exp === "string" ? exp : exp?.import
if (!entry) {
  console.error("RED: missing exports['./tui']")
  process.exit(1)
}

const entryUrl = pathToFileURL(path.join(pkgDir, entry)).href
console.log("entry", entryUrl)

let mod
try {
  mod = await import(entryUrl)
} catch (error) {
  console.error("RED: import failed")
  console.error(error)
  process.exit(2)
}

const value = mod.default
if (!value || typeof value !== "object") {
  console.error("RED: default export is not an object", value)
  process.exit(3)
}
if (typeof value.tui !== "function") {
  console.error("RED: missing tui()", value)
  process.exit(4)
}
if ("server" in value) {
  console.error("RED: combined server+tui module rejected by OpenCode")
  process.exit(5)
}

const layers = []
const api = {
  keymap: {
    registerLayer(layer) {
      layers.push(layer)
    },
  },
  ui: {
    Dialog: () => null,
    dialog: { replace() {}, clear() {} },
  },
}

try {
  await value.tui(api, undefined, { id: "opencode-hypa", state: "first" })
} catch (error) {
  console.error("RED: tui() threw")
  console.error(error)
  process.exit(6)
}

const commands = layers.flatMap((layer) => layer.commands ?? [])
const hypa = commands.find((command) => command.slashName === "hypa")
console.log(
  JSON.stringify(
    {
      layers: layers.length,
      commands: commands.map((command) => ({
        name: command.name,
        slashName: command.slashName,
        namespace: command.namespace,
      })),
      hasHypa: Boolean(hypa),
    },
    null,
    2,
  ),
)

if (!hypa) {
  console.error("RED: slashName 'hypa' not registered")
  process.exit(7)
}

console.log("GREEN: import + registerLayer slashName=hypa")
