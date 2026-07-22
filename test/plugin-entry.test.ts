import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it } from "node:test"
import plugin from "../src/index.js"
import tuiPlugin from "../src/tui.js"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

function getServerPlugin(value: unknown): ((...args: any[]) => unknown) | undefined {
  if (typeof value === "function") return value
  if (!value || typeof value !== "object" || !("server" in value)) return
  const server = (value as { server?: unknown }).server
  return typeof server === "function" ? (server as (...args: any[]) => unknown) : undefined
}

describe("plugin entry exports", () => {
  it("uses the OpenCode v1 server-only PluginModule shape", () => {
    assert.equal(typeof plugin, "object")
    assert.equal(plugin.id, "opencode-hypa")
    assert.equal(typeof plugin.server, "function")
    assert.equal(
      "tui" in plugin,
      false,
      "server entry must not export tui (OpenCode rejects combined modules)",
    )
  })

  it("uses the OpenCode v1 tui-only module shape", () => {
    assert.equal(typeof tuiPlugin, "object")
    assert.equal(tuiPlugin.id, "opencode-hypa")
    assert.equal(typeof tuiPlugin.tui, "function")
    assert.equal(
      "server" in tuiPlugin,
      false,
      "tui entry must not export server (OpenCode rejects combined modules)",
    )
  })

  it("declares separate package exports for server and tui targets", async () => {
    const pkg = JSON.parse(
      await import("node:fs/promises").then((fs) =>
        fs.readFile(join(root, "package.json"), "utf8"),
      ),
    ) as {
      exports?: Record<string, { import?: string }>
    }

    assert.equal(pkg.exports?.["./server"]?.import, "./dist/index.js")
    assert.equal(pkg.exports?.["./tui"]?.import, "./dist/tui.js")
  })

  it("does not expose helper functions that OpenCode would treat as plugins", async () => {
    const mod = await import("../src/index.js")
    const runtimeExports = Object.entries(mod).filter(([, value]) => typeof value !== "undefined")
    const functionExports = runtimeExports.filter(([, value]) => typeof value === "function")

    assert.deepEqual(
      functionExports.map(([name]) => name),
      [],
      `unexpected function exports: ${functionExports.map(([name]) => name).join(", ")}`,
    )

    const seen = new Set<unknown>()
    const plugins: Array<(...args: any[]) => unknown> = []
    for (const [, entry] of runtimeExports) {
      if (seen.has(entry)) continue
      seen.add(entry)
      const server = getServerPlugin(entry)
      assert.ok(server, "every runtime export must resolve to a server plugin")
      plugins.push(server)
    }

    assert.equal(plugins.length, 1)

    const hooks = await plugins[0]!({} as any, { binary: "/opt/hypa" })
    assert.equal(typeof (hooks as { "tool.execute.before"?: unknown })["tool.execute.before"], "function")
    assert.equal(typeof (hooks as { "tool.execute.after"?: unknown })["tool.execute.after"], "function")
  })

  it("accepts plugin options on the server entry", async () => {
    const hooks = await plugin.server!({} as any, { enabled: false })
    assert.deepEqual(hooks, {})
  })
})

describe("built package entrypoints", () => {
  it("emits a JSX-free tui.js entry for OpenCode's node_modules loader", () => {
    assert.equal(existsSync(join(root, "dist/index.js")), true, "dist/index.js missing — run npm run build")
    assert.equal(existsSync(join(root, "dist/tui.js")), true, "dist/tui.js missing — run npm run build")
    assert.equal(
      existsSync(join(root, "dist/tui.jsx")),
      false,
      "dist/tui.jsx must not ship; OpenCode skips JSX transform under node_modules",
    )
  })
})
