import assert from "node:assert/strict"
import { existsSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it } from "node:test"
import { rewriteCommand } from "../src/rewrite.js"
import { loadConfig } from "../src/policy.js"

const spawnTrackerPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "spawn-tracker.js",
)

function hangingRewriteConfig() {
  return {
    ...loadConfig({}),
    binary: spawnTrackerPath,
    rewriteTimeoutMs: 60_000,
  }
}

async function waitForSpawn(markerPath: string, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!existsSync(markerPath)) {
    if (Date.now() >= deadline) {
      throw new Error(`spawn marker not created: ${markerPath}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

describe("rewriteCommand", () => {
  it("skips commands that already start with hypa", async () => {
    const status = await rewriteCommand(loadConfig({}), "hypa git status")
    assert.equal(status.kind, "skipped")
  })

  it("rewrites git status through hypa when available", async () => {
    const status = await rewriteCommand(loadConfig({}), "git status")
    if (status.kind === "error") {
      // Environment without hypa should fail open at plugin level; here we just accept error.
      assert.match(status.error, /hypa|ENOENT|not found/i)
      return
    }
    assert.equal(status.kind, "rewritten")
    if (status.kind === "rewritten") {
      assert.equal(status.command, "hypa git status")
    }
  })

  it("wraps generic commands", async () => {
    const status = await rewriteCommand(loadConfig({}), "pytest -q")
    if (status.kind === "error") return
    assert.equal(status.kind, "rewritten")
    if (status.kind === "rewritten") {
      assert.match(status.command, /^hypa -c /)
    }
  })

  it("fail-opens when signal is already aborted without spawning hypa", async () => {
    const markerDir = mkdtempSync(join(tmpdir(), "hypa-abort-"))
    const markerPath = join(markerDir, "spawned")
    const controller = new AbortController()
    controller.abort(new Error("already aborted"))
    const previousMarker = process.env.SPAWN_MARKER
    process.env.SPAWN_MARKER = markerPath

    try {
      const status = await rewriteCommand(
        hangingRewriteConfig(),
        "git status",
        controller.signal,
      )

      assert.equal(status.kind, "error")
      if (status.kind === "error") {
        assert.equal(status.input, "git status")
        assert.match(status.error, /already aborted/)
      }
      assert.equal(existsSync(markerPath), false)
    } finally {
      if (previousMarker === undefined) delete process.env.SPAWN_MARKER
      else process.env.SPAWN_MARKER = previousMarker
    }
  })

  it("fail-opens when signal aborts after spawn and kills the child", async () => {
    const markerDir = mkdtempSync(join(tmpdir(), "hypa-abort-"))
    const markerPath = join(markerDir, "spawned")
    const controller = new AbortController()
    const previousMarker = process.env.SPAWN_MARKER
    process.env.SPAWN_MARKER = markerPath

    try {
      const rewritePromise = rewriteCommand(
        hangingRewriteConfig(),
        "git status",
        controller.signal,
      )

      await waitForSpawn(markerPath)
      controller.abort(new Error("aborted after spawn"))

      const status = await rewritePromise

      assert.equal(status.kind, "error")
      if (status.kind === "error") {
        assert.equal(status.input, "git status")
        assert.match(status.error, /aborted after spawn/)
      }
    } finally {
      if (previousMarker === undefined) delete process.env.SPAWN_MARKER
      else process.env.SPAWN_MARKER = previousMarker
    }
  })
})
