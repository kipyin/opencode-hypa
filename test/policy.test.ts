import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  formatStatus,
  isBashTool,
  isHypaCommand,
  loadConfig,
  mapRewriteResult,
  parseRewriteJson,
} from "../src/policy.js"

describe("isHypaCommand", () => {
  it("detects hypa-prefixed commands", () => {
    assert.equal(isHypaCommand("hypa git status"), true)
    assert.equal(isHypaCommand("  hypa -c \"pytest\""), true)
    assert.equal(isHypaCommand("hypa"), true)
  })

  it("rejects non-hypa commands", () => {
    assert.equal(isHypaCommand("git status"), false)
    assert.equal(isHypaCommand("pathy hypa"), false)
  })
})

describe("isBashTool", () => {
  it("matches bash and shell", () => {
    assert.equal(isBashTool("bash"), true)
    assert.equal(isBashTool("shell"), true)
    assert.equal(isBashTool("read"), false)
  })
})

describe("parseRewriteJson / mapRewriteResult", () => {
  it("maps Rewritten", () => {
    const result = parseRewriteJson(
      JSON.stringify({ input: "git status", outcome: "Rewritten", command: "hypa git status" }),
    )
    assert.deepEqual(mapRewriteResult(result), {
      kind: "rewritten",
      outcome: "Rewritten",
      input: "git status",
      command: "hypa git status",
    })
  })

  it("maps GenericWrapper", () => {
    const result = parseRewriteJson(
      JSON.stringify({
        input: "pytest -q",
        outcome: "GenericWrapper",
        command: 'hypa -c "pytest -q"',
      }),
    )
    assert.equal(mapRewriteResult(result).kind, "rewritten")
  })

  it("maps Deny and Ask", () => {
    assert.equal(
      mapRewriteResult({ input: "rm -rf /", outcome: "Deny", command: "rm -rf /" }).kind,
      "deny",
    )
    assert.equal(
      mapRewriteResult({ input: "sudo ls", outcome: "Ask", command: "sudo ls" }).kind,
      "ask",
    )
  })

  it("rejects invalid payloads", () => {
    assert.throws(() => parseRewriteJson("{}"))
    assert.throws(() =>
      parseRewriteJson(JSON.stringify({ input: "x", outcome: "Nope", command: "x" })),
    )
  })
})

describe("loadConfig", () => {
  it("loads defaults and env overrides", () => {
    const defaults = loadConfig({})
    assert.equal(defaults.binary, "hypa")
    assert.equal(defaults.enabled, true)
    assert.equal(defaults.askNonInteractive, "deny")

    const custom = loadConfig({
      HYPA_BIN: "/opt/hypa",
      OPENCODE_HYPA_ENABLED: "0",
      OPENCODE_HYPA_ASK_NON_INTERACTIVE: "allow",
      OPENCODE_HYPA_REWRITE_TIMEOUT_MS: "1234",
    })
    assert.equal(custom.binary, "/opt/hypa")
    assert.equal(custom.enabled, false)
    assert.equal(custom.askNonInteractive, "allow")
    assert.equal(custom.rewriteTimeoutMs, 1234)
  })
})

describe("formatStatus", () => {
  it("formats rewritten status", () => {
    assert.equal(
      formatStatus({
        kind: "rewritten",
        outcome: "Rewritten",
        input: "git status",
        command: "hypa git status",
      }),
      "Rewritten: git status => hypa git status",
    )
  })
})
