import type { Plugin, PluginModule } from "@opencode-ai/plugin"
import { isBashTool, loadConfig } from "./policy.js"
import { resolveHypaBinary } from "./resolve.js"
import { rewriteCommand } from "./rewrite.js"
import { annotateRewrite, type RewriteRecord } from "./annotate.js"
import {
  clearHypaLastRewrite,
  setHypaEffectiveConfigWithSources,
  setHypaLastRewrite,
  setHypaResolvedBinary,
} from "./state.js"
import type { PluginOptions } from "./types.js"

export type { HypaConfig, HypaConfigWithSources, PluginOptions, RewriteStatus } from "./types.js"

/**
 * OpenCode server plugin that rewrites bash/shell tool calls through Hypa.
 *
 * Dual-target package layout (OpenCode requires separate modules):
 *   exports["./server"] -> this file
 *   exports["./tui"]    -> ./tui.ts
 *
 * Install:
 *   opencode plugin opencode-hypa --global
 *
 * Important: do not re-export helper functions from this entry. OpenCode's legacy
 * plugin loader treats every exported function as a plugin entrypoint.
 * Do not export `tui` here — a module may export server or tui, never both.
 */

const server = (async (_input, options?: PluginOptions) => {
  const config = loadConfig(process.env, options)
  setHypaEffectiveConfigWithSources(config)

  const resolvedBinary = resolveHypaBinary(config.binary)
  setHypaResolvedBinary(resolvedBinary)

  if (!config.enabled) {
    return {}
  }

  // Stash rewrites keyed by callID so tool.execute.after can annotate the
  // tool result the LLM sees. Without this, OpenCode hands the LLM the
  // rewritten command in the tool result with no marker that a plugin
  // changed it, and the LLM rationalizes the prefix as its own typo.
  const rewrites = new Map<string, RewriteRecord>()

  return {
    "tool.execute.before": async (input, output) => {
      if (!isBashTool(input.tool)) return

      const command = String(output.args?.command ?? "")
      if (!command.trim()) return

      const signal =
        "signal" in input && input.signal instanceof AbortSignal
          ? input.signal
          : undefined

      const status = await rewriteCommand(
        { ...config, binary: resolvedBinary },
        command,
        signal,
      )

      switch (status.kind) {
        case "rewritten":
          output.args.command = status.command
          rewrites.set(input.callID, {
            input: status.input,
            command: status.command,
            outcome: status.outcome,
          })
          setHypaLastRewrite({
            input: status.input,
            command: status.command,
            outcome: status.outcome,
          })
          return
        case "passthrough":
        case "skipped":
        case "error":
          // Fail open: keep the original command.
          return
        case "deny":
          throw new Error(status.reason)
        case "ask":
          if (config.askNonInteractive === "allow") {
            output.args.command = status.command
            rewrites.set(input.callID, {
              input: status.input,
              command: status.command,
              outcome: "GenericWrapper",
            })
            setHypaLastRewrite({
              input: status.input,
              command: status.command,
              outcome: "GenericWrapper",
            })
            return
          }
          throw new Error(
            `${status.reason} Non-interactive fallback is deny (set OPENCODE_HYPA_ASK_NON_INTERACTIVE=allow to allow).`,
          )
      }
    },

    "tool.execute.after": async (input, output) => {
      if (!isBashTool(input.tool)) return
      const record = rewrites.get(input.callID)
      if (!record) return
      rewrites.delete(input.callID)
      clearHypaLastRewrite()
      annotateRewrite(output, record)
    },
  }
}) satisfies Plugin

const plugin = {
  id: "opencode-hypa",
  server,
} satisfies PluginModule

export default plugin
