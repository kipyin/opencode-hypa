import assert from "node:assert/strict"
import { existsSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, it } from "node:test"
import plugin from "../src/index.js"
import { getHypaState, resetHypaState } from "../src/state.js"
import type { PluginOptions } from "../src/types.js"

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures")
const fakeHypaRewrite = join(fixturesDir, "fake-hypa-rewrite.js")
const fakeHypaConfigurable = join(fixturesDir, "fake-hypa-configurable.js")
const spawnTrackerPath = join(fixturesDir, "spawn-tracker.js")

type HookInput = { tool: string; callID: string; signal?: AbortSignal }
type BeforeOutput = { args: { command: string } }
type AfterOutput = { title: string; output: string; metadata: Record<string, unknown> }

type ServerHooks = {
  "tool.execute.before": (input: HookInput, output: BeforeOutput) => Promise<void>
  "tool.execute.after": (input: HookInput, output: AfterOutput) => Promise<void>
}

const savedEnvKeys = new Set<string>()

function setTestEnv(env: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(env)) {
    savedEnvKeys.add(key)
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

async function loadHooks(options: PluginOptions): Promise<ServerHooks> {
  resetHypaState()
  const hooks = await plugin.server!({} as never, options)
  return hooks as ServerHooks
}

afterEach(() => {
  resetHypaState()
  for (const key of savedEnvKeys) {
    delete process.env[key]
  }
  savedEnvKeys.clear()
})

describe("T5: server plugin hook boundary integration", () => {
  it("rewrites, records state, and annotates through before and after hooks", async () => {
    const hooks = await loadHooks({ binary: fakeHypaRewrite })
    const callID = "call-rewritten"
    const beforeOutput: BeforeOutput = { args: { command: "git status" } }
    const afterOutput: AfterOutput = { title: "git status", output: "On branch main", metadata: { exit: 0 } }

    await hooks["tool.execute.before"]({ tool: "bash", callID }, beforeOutput)

    assert.equal(beforeOutput.args.command, "hypa git status")
    const stateAfterBefore = getHypaState()
    assert.notEqual(stateAfterBefore.lastRewrite, "none")
    if (stateAfterBefore.lastRewrite === "none") return
    assert.equal(stateAfterBefore.lastRewrite.input, "git status")
    assert.equal(stateAfterBefore.lastRewrite.command, "hypa git status")
    assert.equal(stateAfterBefore.lastRewrite.outcome, "Rewritten")

    await hooks["tool.execute.after"]({ tool: "bash", callID }, afterOutput)

    assert.equal(
      afterOutput.title,
      "[hypa Rewritten] git status => hypa git status\ngit status",
    )
    assert.equal(
      afterOutput.output,
      "[hypa Rewritten] git status => hypa git status\n\nOn branch main",
    )
    assert.deepEqual(afterOutput.metadata.hypaRewrite, {
      input: "git status",
      command: "hypa git status",
      outcome: "Rewritten",
    })
    assert.equal(getHypaState().lastRewrite, "none")
  })

  it("fail-opens on an already-aborted signal without spawning hypa", async () => {
    const markerDir = mkdtempSync(join(tmpdir(), "hypa-hook-abort-"))
    const markerPath = join(markerDir, "spawned")
    const controller = new AbortController()
    controller.abort(new Error("already aborted"))
    setTestEnv({ SPAWN_MARKER: markerPath })

    const hooks = await loadHooks({ binary: spawnTrackerPath, rewriteTimeoutMs: 60_000 })
    const beforeOutput: BeforeOutput = { args: { command: "git status" } }

    await hooks["tool.execute.before"](
      { tool: "bash", callID: "call-abort", signal: controller.signal },
      beforeOutput,
    )

    assert.equal(beforeOutput.args.command, "git status")
    assert.equal(getHypaState().lastRewrite, "none")
    assert.equal(existsSync(markerPath), false)
  })

  it("passes through Passthrough outcomes without rewriting or annotating", async () => {
    setTestEnv({ HYPA_TEST_OUTCOME: "Passthrough" })
    const hooks = await loadHooks({ binary: fakeHypaConfigurable })
    const callID = "call-passthrough"
    const beforeOutput: BeforeOutput = { args: { command: "git status" } }
    const afterOutput: AfterOutput = { title: "t", output: "o", metadata: {} }

    await hooks["tool.execute.before"]({ tool: "bash", callID }, beforeOutput)

    assert.equal(beforeOutput.args.command, "git status")
    assert.equal(getHypaState().lastRewrite, "none")

    await hooks["tool.execute.after"]({ tool: "bash", callID }, afterOutput)

    assert.equal(afterOutput.title, "t")
    assert.equal(afterOutput.output, "o")
    assert.equal(afterOutput.metadata.hypaRewrite, undefined)
  })

  it("throws on Deny outcomes at the before hook", async () => {
    setTestEnv({ HYPA_TEST_OUTCOME: "Deny" })
    const hooks = await loadHooks({ binary: fakeHypaConfigurable })
    const beforeOutput: BeforeOutput = { args: { command: "rm -rf /" } }

    await assert.rejects(
      () => hooks["tool.execute.before"]({ tool: "bash", callID: "call-deny" }, beforeOutput),
      /Command blocked by Hypa policy/,
    )

    assert.equal(beforeOutput.args.command, "rm -rf /")
    assert.equal(getHypaState().lastRewrite, "none")
  })

  it("throws on Ask with askNonInteractive deny", async () => {
    setTestEnv({ HYPA_TEST_OUTCOME: "Ask" })
    const hooks = await loadHooks({ binary: fakeHypaConfigurable, askNonInteractive: "deny" })
    const beforeOutput: BeforeOutput = { args: { command: "curl https://example.com" } }

    await assert.rejects(
      () => hooks["tool.execute.before"]({ tool: "bash", callID: "call-ask-deny" }, beforeOutput),
      /Hypa requests confirmation before running.*Non-interactive fallback is deny/,
    )

    assert.equal(beforeOutput.args.command, "curl https://example.com")
    assert.equal(getHypaState().lastRewrite, "none")
  })

  it("rewrites and annotates Ask with askNonInteractive allow", async () => {
    setTestEnv({ HYPA_TEST_OUTCOME: "Ask" })
    const hooks = await loadHooks({ binary: fakeHypaConfigurable, askNonInteractive: "allow" })
    const callID = "call-ask-allow"
    const beforeOutput: BeforeOutput = { args: { command: "curl https://example.com" } }
    const afterOutput: AfterOutput = { title: "", output: "", metadata: {} }

    await hooks["tool.execute.before"]({ tool: "bash", callID }, beforeOutput)

    assert.equal(beforeOutput.args.command, "curl https://example.com")
    const stateAfterBefore = getHypaState()
    assert.notEqual(stateAfterBefore.lastRewrite, "none")
    if (stateAfterBefore.lastRewrite === "none") return
    assert.equal(stateAfterBefore.lastRewrite.outcome, "GenericWrapper")

    await hooks["tool.execute.after"]({ tool: "bash", callID }, afterOutput)

    assert.equal(
      afterOutput.title,
      "[hypa GenericWrapper] curl https://example.com => curl https://example.com",
    )
    assert.deepEqual(afterOutput.metadata.hypaRewrite, {
      input: "curl https://example.com",
      command: "curl https://example.com",
      outcome: "GenericWrapper",
    })
  })
})
