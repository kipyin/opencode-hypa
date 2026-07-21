import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  formatHypaDiagnostics,
  type HypaDiagnosticsInput,
} from "../src/diagnostics.js"
import type { HypaConfigWithSources } from "../src/types.js"

const sampleConfig: HypaConfigWithSources = {
  binary: "/opt/hypa",
  rewriteTimeoutMs: 8000,
  askNonInteractive: "allow",
  enabled: false,
  sources: {
    binary: "env",
    rewriteTimeoutMs: "options",
    askNonInteractive: "default",
    enabled: "options",
  },
}

function baseInput(overrides: Partial<HypaDiagnosticsInput> = {}): HypaDiagnosticsInput {
  return {
    resolvedBinary: "/opt/hypa",
    effectiveConfigWithSources: sampleConfig,
    lastRewrite: "none",
    hypaVersion: "hypa 0.1.11",
    binaryExists: true,
    ...overrides,
  }
}

describe("formatHypaDiagnostics", () => {
  it("renders five sections in order for a healthy snapshot", () => {
    const text = formatHypaDiagnostics(
      baseInput({
        lastRewrite: {
          input: "git status",
          command: "hypa git status",
          outcome: "Rewritten",
          timestamp: 1_700_000_000_000,
        },
      }),
    )

    const enabledIdx = text.indexOf("enabled:")
    const binaryIdx = text.indexOf("binary:")
    const versionIdx = text.indexOf("version:")
    const configIdx = text.indexOf("config:")
    const rewriteIdx = text.indexOf("last rewrite:")

    assert.ok(enabledIdx >= 0)
    assert.ok(binaryIdx > enabledIdx)
    assert.ok(versionIdx > binaryIdx)
    assert.ok(configIdx > versionIdx)
    assert.ok(rewriteIdx > configIdx)

    assert.match(text, /^enabled: false$/m)
    assert.match(text, /^  path: \/opt\/hypa$/m)
    assert.match(text, /^  exists: true$/m)
    assert.match(text, /^version: hypa 0\.1\.11$/m)
    assert.match(text, /^  binary: "\/opt\/hypa" \(env\)$/m)
    assert.match(text, /^  rewriteTimeoutMs: 8000 \(options\)$/m)
    assert.match(text, /^  askNonInteractive: "allow" \(default\)$/m)
    assert.match(text, /^  enabled: false \(options\)$/m)
    assert.match(text, /^  input: git status$/m)
    assert.match(text, /^  command: hypa git status$/m)
    assert.match(text, /^  outcome: Rewritten$/m)
    assert.match(text, /^  timestamp: /m)
  })

  it("renders last rewrite as none", () => {
    const text = formatHypaDiagnostics(baseInput())
    assert.match(text, /^last rewrite: none$/m)
  })

  it("renders a missing-binary error state without crashing", () => {
    const text = formatHypaDiagnostics(
      baseInput({
        resolvedBinary: "/missing/hypa",
        binaryExists: false,
        hypaVersion: "",
      }),
    )

    assert.match(text, /^error: binary not found: \/missing\/hypa$/m)
    assert.match(text, /^  path: \/missing\/hypa$/m)
    assert.match(text, /^  exists: false$/m)
  })

  it("handles undefined config and binary gracefully", () => {
    const text = formatHypaDiagnostics({
      resolvedBinary: undefined,
      effectiveConfigWithSources: undefined,
      lastRewrite: "none",
      hypaVersion: undefined,
      binaryExists: false,
    })

    assert.match(text, /^enabled: unknown$/m)
    assert.match(text, /^  path: \(unknown\)$/m)
    assert.match(text, /^version: \(unknown\)$/m)
    assert.match(text, /^config: \(unknown\)$/m)
    assert.match(text, /^last rewrite: none$/m)
  })
})
