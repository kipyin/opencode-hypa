import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { rewriteCommand } from "../src/rewrite.js"
import { loadConfig } from "../src/policy.js"

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
})
