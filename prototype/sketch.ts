// PROTOTYPE — throwaway. Answers issue #10:
// "Does a cheap concrete sketch of opencode.json plugin options plus sample
// diagnostics command output feel right as the DX target for the quality bar?"
//
// Run: npx tsx prototype/sketch.ts
//
// Prints two sections:
//   1. opencode.json plugin options (tuple form, all fields, precedence noted)
//   2. /hypa diagnostics command output (resolved binary, effective config
//      with per-field source, last rewrite, rolling counts)
//
// Nothing here is wired to the real plugin. It renders sample state so we can
// judge the shape. Delete this file once the verdict is folded into the spec.

type AskPolicy = "allow" | "deny"

type PluginOptions = {
  enabled?: boolean
  binary?: string
  rewriteTimeoutMs?: number
  askNonInteractive?: AskPolicy
}

type ResolvedField<T> = {
  key: string
  value: T
  source: "env" | "options" | "default"
}

type DiagnosticsState = {
  resolvedBinary: { path: string; version: string | null }
  config: ResolvedField<boolean | string | number | AskPolicy>[]
  lastRewrite: {
    at: string
    tool: string
    input: string
    outcome: "Rewritten" | "GenericWrapper" | "Passthrough" | "Deny" | "Ask" | "Skipped" | "Error"
    command: string
  } | null
  counts: Record<string, number>
}

// --- sample state ---------------------------------------------------------

const optionsBlock: PluginOptions = {
  enabled: true,
  binary: "hypa",
  rewriteTimeoutMs: 5000,
  askNonInteractive: "deny",
}

const diagnostics: DiagnosticsState = {
  resolvedBinary: {
    path: "/Users/kip/Code/opencode-hypa/node_modules/.bin/hypa",
    version: "hypa 0.1.11",
  },
  config: [
    { key: "enabled", value: true, source: "default" },
    { key: "binary", value: "/Users/kip/Code/opencode-hypa/node_modules/.bin/hypa", source: "env" },
    { key: "rewriteTimeoutMs", value: 5000, source: "default" },
    { key: "askNonInteractive", value: "deny", source: "options" },
  ],
  lastRewrite: {
    at: "2026-07-21T09:14:02Z",
    tool: "bash",
    input: "git log --oneline -10",
    outcome: "Rewritten",
    command: "hypa git log --oneline -10",
  },
  counts: {
    Rewritten: 14,
    GenericWrapper: 2,
    Passthrough: 31,
    Deny: 1,
    Ask: 0,
    Skipped: 6,
    Error: 0,
  },
}

// --- renderers ------------------------------------------------------------

function renderOptionsJson(opts: PluginOptions): string {
  const lines = [
    "{",
    '  "$schema": "https://opencode.ai/config.json",',
    '  "plugin": [',
    "    [",
    '      "opencode-hypa",',
    "      {",
  ]
  const entries = Object.entries(opts)
  for (const [i, [k, v]] of entries.entries()) {
    const comma = i === entries.length - 1 ? "" : ","
    const json = JSON.stringify(v)
    lines.push(`        "${k}": ${json}${comma}`)
  }
  lines.push("      }")
  lines.push("    ]")
  lines.push("  ]")
  lines.push("}")
  return lines.join("\n")
}

function renderOptionsDoc(): string {
  return [
    "# Fields (precedence: env > options > defaults)",
    "",
    "| Field | Type | Default | Env var |",
    "|---|---|---|---|",
    "| `enabled` | boolean | `true` | `OPENCODE_HYPA_ENABLED` (`0`/`false`/`no`/`off` disable) |",
    "| `binary` | string | `\"hypa\"` | `HYPA_BIN` |",
    "| `rewriteTimeoutMs` | number | `5000` | `OPENCODE_HYPA_REWRITE_TIMEOUT_MS` |",
    "| `askNonInteractive` | `\"allow\"` \\| `\"deny\"` | `\"deny\"` | `OPENCODE_HYPA_ASK_NON_INTERACTIVE` |",
    "",
    "Unknown keys are ignored. Invalid values fall back to the default for that field.",
  ].join("\n")
}

function renderDiagnostics(s: DiagnosticsState): string {
  const bar = "─".repeat(60)
  const lines: string[] = []
  lines.push(`/hypa${" ".repeat(56)}`)
  lines.push(bar)
  lines.push("")
  lines.push("  resolved binary")
  lines.push(`    path     ${s.resolvedBinary.path}`)
  lines.push(`    version  ${s.resolvedBinary.version ?? "unknown"}`)
  lines.push("")
  lines.push("  effective config  (env > options > default)")
  for (const f of s.config) {
    lines.push(`    ${f.key.padEnd(20)} ${JSON.stringify(f.value).padEnd(28)} [${f.source}]`)
  }
  lines.push("")
  lines.push("  last rewrite")
  if (s.lastRewrite) {
    const r = s.lastRewrite
    lines.push(`    at        ${r.at}`)
    lines.push(`    tool      ${r.tool}`)
    lines.push(`    input     ${r.input}`)
    lines.push(`    outcome   ${r.outcome}`)
    lines.push(`    command   ${r.command}`)
  } else {
    lines.push("    (none yet this session)")
  }
  lines.push("")
  lines.push("  counts (since plugin load)")
  const order = ["Rewritten", "GenericWrapper", "Passthrough", "Deny", "Ask", "Skipped", "Error"]
  for (const k of order) {
    const n = s.counts[k] ?? 0
    lines.push(`    ${k.padEnd(16)} ${String(n).padStart(4)}`)
  }
  lines.push("")
  lines.push(bar)
  return lines.join("\n")
}

// --- main -----------------------------------------------------------------

console.log("=".repeat(60))
console.log("SECTION 1 — opencode.json plugin options (tuple form)")
console.log("=".repeat(60))
console.log()
console.log(renderOptionsJson(optionsBlock))
console.log()
console.log(renderOptionsDoc())
console.log()
console.log("=".repeat(60))
console.log("SECTION 2 — /hypa diagnostics command output")
console.log("=".repeat(60))
console.log()
console.log(renderDiagnostics(diagnostics))
console.log()
console.log("=".repeat(60))
console.log("SECTION 2b — /hypa with no rewrites yet this session")
console.log("=".repeat(60))
console.log()
console.log(
  renderDiagnostics({
    ...diagnostics,
    lastRewrite: null,
    counts: { Rewritten: 0, GenericWrapper: 0, Passthrough: 0, Deny: 0, Ask: 0, Skipped: 0, Error: 0 },
  }),
)