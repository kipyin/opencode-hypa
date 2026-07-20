import assert from "node:assert/strict"
import { describe, it } from "node:test"
import plugin from "../src/index.js"

function getServerPlugin(value: unknown): ((...args: any[]) => unknown) | undefined {
  if (typeof value === "function") return value
  if (!value || typeof value !== "object" || !("server" in value)) return
  const server = (value as { server?: unknown }).server
  return typeof server === "function" ? (server as (...args: any[]) => unknown) : undefined
}

describe("plugin entry exports", () => {
  it("uses the OpenCode v1 PluginModule shape", () => {
    assert.equal(typeof plugin, "object")
    assert.equal(plugin.id, "opencode-hypa")
    assert.equal(typeof plugin.server, "function")
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

    const hooks = await plugins[0]!({} as any, undefined)
    assert.equal(typeof (hooks as { "tool.execute.before"?: unknown })["tool.execute.before"], "function")
  })
})
