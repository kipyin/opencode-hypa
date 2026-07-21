import type { HypaStateSnapshot } from "./state.js"
import type { ConfigSource, HypaConfigWithSources } from "./types.js"

export type HypaDiagnosticsInput = HypaStateSnapshot & {
  binaryExists: boolean
}

const CONFIG_FIELDS = [
  "binary",
  "rewriteTimeoutMs",
  "askNonInteractive",
  "enabled",
] as const satisfies ReadonlyArray<keyof HypaConfigWithSources>

function formatConfigSource(source: ConfigSource): string {
  return `(${source})`
}

function formatConfigValue(value: string | number | boolean): string {
  return JSON.stringify(value)
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString()
}

export function formatHypaDiagnostics(input: HypaDiagnosticsInput): string {
  const lines: string[] = []
  const config = input.effectiveConfigWithSources
  const binaryPath = input.resolvedBinary ?? "(unknown)"

  if (input.resolvedBinary && !input.binaryExists) {
    lines.push(`error: binary not found: ${input.resolvedBinary}`)
    lines.push("")
  }

  lines.push(`enabled: ${config ? String(config.enabled) : "unknown"}`)
  lines.push("")
  lines.push("binary:")
  lines.push(`  path: ${binaryPath}`)
  lines.push(`  exists: ${input.binaryExists}`)
  lines.push("")
  lines.push(`version: ${input.hypaVersion?.trim() || "(unknown)"}`)
  lines.push("")

  if (!config) {
    lines.push("config: (unknown)")
  } else {
    lines.push("config:")
    for (const field of CONFIG_FIELDS) {
      lines.push(
        `  ${field}: ${formatConfigValue(config[field])} ${formatConfigSource(config.sources[field])}`,
      )
    }
  }

  lines.push("")
  if (input.lastRewrite === "none") {
    lines.push("last rewrite: none")
  } else {
    lines.push("last rewrite:")
    lines.push(`  input: ${input.lastRewrite.input}`)
    lines.push(`  command: ${input.lastRewrite.command}`)
    lines.push(`  outcome: ${input.lastRewrite.outcome}`)
    lines.push(`  timestamp: ${formatTimestamp(input.lastRewrite.timestamp)}`)
  }

  return lines.join("\n")
}
