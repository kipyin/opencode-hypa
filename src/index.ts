import type { Plugin, PluginModule } from "@opencode-ai/plugin"
import { isBashTool, loadConfig } from "./policy.js"
import { resolveHypaBinary } from "./resolve.js"
import { rewriteCommand } from "./rewrite.js"
import { annotateRewrite, type RewriteRecord } from "./annotate.js"
import {
  setHypaEffectiveConfigWithSources,
  setHypaLastRewrite,
  setHypaResolvedBinary,
} from "./state.js"
import type { PluginOptions } from "./types.js"

export type { PluginOptions }

function applyRewrite(
  output: { args: { command?: unknown } },
  rewrites: Map<string, RewriteRecord>,
  callID: string,
  record: RewriteRecord,
): void {
  output.args.command = record.command
  rewrites.set(callID, record)
  setHypaLastRewrite(record)
}

/**
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
          applyRewrite(output, rewrites, input.callID, {
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
            applyRewrite(output, rewrites, input.callID, {
              input: status.input,
              command: status.command,
              outcome: "Ask",
            })
            return
          }
          throw new Error(
            `${status.reason} Non-interactive fallback is deny (set OPENCODE_HYPA_ASK_NON_INTERACTIVE=allow to allow).`,
          )
        default: {
          const _exhaustive: never = status
          return _exhaustive
        }
      }
    },

    "tool.execute.after": async (input, output) => {
      if (!isBashTool(input.tool)) return
      const record = rewrites.get(input.callID)
      if (!record) return
      rewrites.delete(input.callID)
      annotateRewrite(output, record)
    },
  }
}) satisfies Plugin

const plugin = {
  id: "opencode-hypa",
  server,
} satisfies PluginModule

export default plugin
