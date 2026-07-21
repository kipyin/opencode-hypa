import assert from "node:assert/strict"
import { describe, it, mock } from "node:test"
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
  it("loads defaults with source metadata", () => {
    const config = loadConfig({})
    assert.equal(config.binary, "hypa")
    assert.equal(config.enabled, true)
    assert.equal(config.askNonInteractive, "deny")
    assert.equal(config.rewriteTimeoutMs, 5000)
    assert.deepEqual(config.sources, {
      binary: "default",
      rewriteTimeoutMs: "default",
      askNonInteractive: "default",
      enabled: "default",
    })
  })

  it("loads env overrides with source metadata", () => {
    const config = loadConfig({
      OPENCODE_HYPA_BIN: "/opt/hypa",
      OPENCODE_HYPA_ENABLED: "0",
      OPENCODE_HYPA_ASK_NON_INTERACTIVE: "allow",
      OPENCODE_HYPA_REWRITE_TIMEOUT_MS: "1234",
    })
    assert.equal(config.binary, "/opt/hypa")
    assert.equal(config.enabled, false)
    assert.equal(config.askNonInteractive, "allow")
    assert.equal(config.rewriteTimeoutMs, 1234)
    assert.deepEqual(config.sources, {
      binary: "env",
      rewriteTimeoutMs: "env",
      askNonInteractive: "env",
      enabled: "env",
    })
  })

  it("loads plugin options with source metadata", () => {
    const config = loadConfig(
      {},
      {
        binary: "/usr/local/bin/hypa",
        rewriteTimeoutMs: 9000,
        askNonInteractive: "allow",
        enabled: false,
      },
    )
    assert.equal(config.binary, "/usr/local/bin/hypa")
    assert.equal(config.rewriteTimeoutMs, 9000)
    assert.equal(config.askNonInteractive, "allow")
    assert.equal(config.enabled, false)
    assert.deepEqual(config.sources, {
      binary: "options",
      rewriteTimeoutMs: "options",
      askNonInteractive: "options",
      enabled: "options",
    })
  })

  it("prefers env over options", () => {
    const config = loadConfig(
      { OPENCODE_HYPA_BIN: "/env/hypa", OPENCODE_HYPA_ENABLED: "1" },
      { binary: "/options/hypa", enabled: false },
    )
    assert.equal(config.binary, "/env/hypa")
    assert.equal(config.enabled, true)
    assert.equal(config.sources.binary, "env")
    assert.equal(config.sources.enabled, "env")
  })

  it("warns and falls back to defaults for invalid env values", () => {
    const warn = mock.fn()
    const originalWarn = console.warn
    console.warn = warn

    try {
      const config = loadConfig({
        OPENCODE_HYPA_BIN: "   ",
        OPENCODE_HYPA_REWRITE_TIMEOUT_MS: "nope",
        OPENCODE_HYPA_ASK_NON_INTERACTIVE: "maybe",
        OPENCODE_HYPA_ENABLED: "sometimes",
      })

      assert.equal(config.binary, "hypa")
      assert.equal(config.rewriteTimeoutMs, 5000)
      assert.equal(config.askNonInteractive, "deny")
      assert.equal(config.enabled, true)
      assert.deepEqual(config.sources, {
        binary: "default",
        rewriteTimeoutMs: "default",
        askNonInteractive: "default",
        enabled: "default",
      })
      assert.equal(warn.mock.calls.length, 4)
    } finally {
      console.warn = originalWarn
    }
  })

  it("warns and falls back to defaults for invalid option values", () => {
    const warn = mock.fn()
    const originalWarn = console.warn
    console.warn = warn

    try {
      const config = loadConfig(
        {},
        {
          binary: 123 as unknown as string,
          rewriteTimeoutMs: -1,
          askNonInteractive: "maybe" as "allow",
          enabled: "no" as unknown as boolean,
        },
      )

      assert.equal(config.binary, "hypa")
      assert.equal(config.rewriteTimeoutMs, 5000)
      assert.equal(config.askNonInteractive, "deny")
      assert.equal(config.enabled, true)
      assert.deepEqual(config.sources, {
        binary: "default",
        rewriteTimeoutMs: "default",
        askNonInteractive: "default",
        enabled: "default",
      })
      assert.equal(warn.mock.calls.length, 4)
    } finally {
      console.warn = originalWarn
    }
  })

  it("does not use HYPA_BIN", () => {
    const config = loadConfig({ HYPA_BIN: "/legacy/hypa" })
    assert.equal(config.binary, "hypa")
    assert.equal(config.sources.binary, "default")
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
