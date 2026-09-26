import type { HypaStateSnapshot, LastRewrite } from "./state.js"
import { HYPA_CONFIG_FIELDS, type ConfigSource } from "./types.js"

const LAST_REWRITE_FIELDS = [
  "input",
  "command",
  "outcome",
  "timestamp",
] as const satisfies readonly (keyof LastRewrite)[]

type MissingLastRewriteField = Exclude<keyof LastRewrite, (typeof LAST_REWRITE_FIELDS)[number]>
const _allLastRewriteFieldsListed: MissingLastRewriteField extends never ? true : never = true

export type HypaDiagnosticsInput = HypaStateSnapshot & {
  binaryExists: boolean
}

function formatConfigSource(source: ConfigSource): string {
  return `(${source})`
}

function formatConfigValue(value: string | number | boolean): string {
  return JSON.stringify(value)
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString()
}

function formatLastRewriteField(
  record: LastRewrite,
  field: (typeof LAST_REWRITE_FIELDS)[number],
): string {
  switch (field) {
    case "input":
    case "command":
    case "outcome":
      return record[field]
    case "timestamp":
      return formatTimestamp(record.timestamp)
    default: {
      const _exhaustive: never = field
      return _exhaustive
    }
  }
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
    for (const field of HYPA_CONFIG_FIELDS) {
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
    for (const field of LAST_REWRITE_FIELDS) {
      lines.push(`  ${field}: ${formatLastRewriteField(input.lastRewrite, field)}`)
    }
  }

  return lines.join("\n")
}
