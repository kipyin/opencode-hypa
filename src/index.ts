import type { Plugin, PluginModule } from "@opencode-ai/plugin"
import { isBashTool, loadConfig } from "./policy.js"
import { resolveHypaBinary } from "./resolve.js"
import { rewriteCommand } from "./rewrite.js"

export type { HypaConfig, RewriteStatus } from "./types.js"

/**
 * OpenCode plugin that rewrites bash/shell tool calls through Hypa before execution.
 *
 * Install:
 *   opencode plugin opencode-hypa --global
 *
 * Or add to opencode.json:
 *   { "plugin": ["opencode-hypa"] }
 *
 * Important: do not re-export helper functions from this entry. OpenCode's legacy
 * plugin loader treats every exported function as a plugin entrypoint.
 */
const server: Plugin = async () => {
  const config = loadConfig()

  if (!config.enabled) {
    return {}
  }

  // Resolve once at startup for clearer failures later.
  const resolvedBinary = resolveHypaBinary(config.binary)

  return {
    "tool.execute.before": async (input, output) => {
      if (!isBashTool(input.tool)) return

      const command = String(output.args?.command ?? "")
      if (!command.trim()) return

      const status = await rewriteCommand(
        { ...config, binary: resolvedBinary },
        command,
      )

      switch (status.kind) {
        case "rewritten":
          output.args.command = status.command
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
            return
          }
          throw new Error(
            `${status.reason} Non-interactive fallback is deny (set OPENCODE_HYPA_ASK_NON_INTERACTIVE=allow to allow).`,
          )
      }
    },
  }
}

const plugin: PluginModule = {
  id: "opencode-hypa",
  server,
}

export default plugin
