import assert from "node:assert/strict"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, it } from "node:test"
import plugin from "../src/index.js"
import {
  clearHypaLastRewrite,
  getHypaState,
  resetHypaState,
  setHypaEffectiveConfigWithSources,
  setHypaLastRewrite,
  setHypaResolvedBinary,
  setHypaVersion,
} from "../src/state.js"
import type { HypaConfigWithSources } from "../src/types.js"

const fakeHypaBinary = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "fake-hypa-rewrite.js",
)

const sampleConfig: HypaConfigWithSources = {
  binary: "/opt/hypa",
  rewriteTimeoutMs: 5000,
  askNonInteractive: "deny",
  enabled: true,
  sources: {
    binary: "options",
    rewriteTimeoutMs: "default",
    askNonInteractive: "default",
    enabled: "default",
  },
}

afterEach(() => {
  resetHypaState()
})

describe("hypaState singleton", () => {
  it("returns written load snapshot values", () => {
    setHypaResolvedBinary("/opt/hypa")
    setHypaEffectiveConfigWithSources(sampleConfig)

    assert.deepEqual(getHypaState(), {
      resolvedBinary: "/opt/hypa",
      effectiveConfigWithSources: sampleConfig,
      lastRewrite: "none",
      hypaVersion: undefined,
    })
  })

  it("returns written lastRewrite values", () => {
    setHypaLastRewrite({
      input: "git status",
      command: "hypa git status",
      outcome: "Rewritten",
    })

    const state = getHypaState()
    assert.notEqual(state.lastRewrite, "none")
    if (state.lastRewrite === "none") return
    assert.equal(state.lastRewrite.input, "git status")
    assert.equal(state.lastRewrite.command, "hypa git status")
    assert.equal(state.lastRewrite.outcome, "Rewritten")
    assert.equal(typeof state.lastRewrite.timestamp, "number")
  })

  it("clears lastRewrite to none", () => {
    setHypaLastRewrite({
      input: "git status",
      command: "hypa git status",
      outcome: "Rewritten",
    })
    clearHypaLastRewrite()
    assert.equal(getHypaState().lastRewrite, "none")
  })

  it("stores hypaVersion for TUI cache", () => {
    setHypaVersion("0.1.11")
    assert.equal(getHypaState().hypaVersion, "0.1.11")
  })
})

describe("server plugin state bridge", () => {
  it("writes load snapshot and clears lastRewrite after tool.execute.after", async () => {
    resetHypaState()

    const hooks = await plugin.server!({} as any, { binary: fakeHypaBinary })
    const before = (hooks as { "tool.execute.before": Function })["tool.execute.before"]
    const after = (hooks as { "tool.execute.after": Function })["tool.execute.after"]

    assert.equal(getHypaState().resolvedBinary, fakeHypaBinary)
    assert.equal(getHypaState().effectiveConfigWithSources?.binary, fakeHypaBinary)
    assert.equal(getHypaState().lastRewrite, "none")

    const output = { args: { command: "git status" } }
    await before({ tool: "bash", callID: "call-1" }, output)
    assert.notEqual(getHypaState().lastRewrite, "none")
    assert.equal(output.args.command, "hypa git status")

    await after({ tool: "bash", callID: "call-1" }, { title: "", output: "", metadata: {} })
    assert.equal(getHypaState().lastRewrite, "none")
  })
})
