import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import {
  getHypaState,
  resetHypaState,
  setHypaEffectiveConfigWithSources,
  setHypaLastRewrite,
  setHypaResolvedBinary,
  setHypaVersion,
} from "../src/state.js"
import type { HypaConfigWithSources } from "../src/types.js"

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

  it("stores hypaVersion for TUI cache", () => {
    setHypaVersion("0.1.11")
    assert.equal(getHypaState().hypaVersion, "0.1.11")
  })
})
