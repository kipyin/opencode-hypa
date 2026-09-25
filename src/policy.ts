import {
  ASK_NON_INTERACTIVE_POLICIES,
  REWRITE_OUTCOMES,
  type AskNonInteractivePolicy,
  type ConfigSource,
  type HypaConfigWithSources,
  type PluginOptions,
  type RewriteOutcome,
  type RewriteResultV1,
  type RewriteStatus,
} from "./types.js"

const VALID_OUTCOMES = new Set<RewriteOutcome>(REWRITE_OUTCOMES)
const VALID_ASK_POLICIES = new Set<AskNonInteractivePolicy>(ASK_NON_INTERACTIVE_POLICIES)

const BASH_TOOLS = new Set(["bash", "shell"])

const DEFAULTS = {
  binary: "hypa",
  rewriteTimeoutMs: 5000,
  askNonInteractive: "deny" as AskNonInteractivePolicy,
  enabled: true,
}

export function isBashTool(tool: string): boolean {
  return BASH_TOOLS.has(tool)
}

export function isHypaCommand(command: string): boolean {
  const trimmed = command.trimStart()
  return trimmed === "hypa" || trimmed.startsWith("hypa ")
}

function warnInvalid(field: string, value: unknown, fallback: unknown): void {
  console.warn(
    `[opencode-hypa] Invalid ${field} value ${JSON.stringify(value)}; falling back to ${JSON.stringify(fallback)}`,
  )
}

type Sourced<T> = {
  value: T
  source: ConfigSource
}

function resolveField<T>(
  field: string,
  fallback: T,
  envValue: string | undefined,
  parseEnv: (raw: string) => T | undefined,
  optionValue: unknown,
  parseOption: (raw: unknown) => T | undefined,
): Sourced<T> {
  if (envValue !== undefined) {
    const parsed = parseEnv(envValue)
    if (parsed !== undefined) return { value: parsed, source: "env" }
    warnInvalid(field, envValue, fallback)
    return { value: fallback, source: "default" }
  }

  if (optionValue !== undefined) {
    const parsed = parseOption(optionValue)
    if (parsed !== undefined) return { value: parsed, source: "options" }
    warnInvalid(field, optionValue, fallback)
    return { value: fallback, source: "default" }
  }

  return { value: fallback, source: "default" }
}

function parseBinary(raw: string): string | undefined {
  const trimmed = raw.trim()
  return trimmed ? trimmed : undefined
}

function parseBinaryOption(raw: unknown): string | undefined {
  return typeof raw === "string" ? parseBinary(raw) : undefined
}

function parsePositiveInt(raw: string): number | undefined {
  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

function parsePositiveIntOption(raw: unknown): number | undefined {
  return typeof raw === "number" && Number.isInteger(raw) && raw > 0 ? raw : undefined
}

function isAskPolicy(value: string): value is AskNonInteractivePolicy {
  return VALID_ASK_POLICIES.has(value as AskNonInteractivePolicy)
}

function parseAsk(raw: string): AskNonInteractivePolicy | undefined {
  const normalized = raw.trim().toLowerCase()
  return isAskPolicy(normalized) ? normalized : undefined
}

function parseAskOption(raw: unknown): AskNonInteractivePolicy | undefined {
  return typeof raw === "string" && isAskPolicy(raw) ? raw : undefined
}

const ENABLED_FLAGS = new Map<string, boolean>([
  ["0", false],
  ["false", false],
  ["no", false],
  ["off", false],
  ["1", true],
  ["true", true],
  ["yes", true],
  ["on", true],
])

function parseEnabled(raw: string): boolean | undefined {
  return ENABLED_FLAGS.get(raw.trim().toLowerCase())
}

function parseEnabledOption(raw: unknown): boolean | undefined {
  return typeof raw === "boolean" ? raw : undefined
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  options?: PluginOptions,
): HypaConfigWithSources {
  const binary = resolveField(
    "binary",
    DEFAULTS.binary,
    env.OPENCODE_HYPA_BIN,
    parseBinary,
    options?.binary,
    parseBinaryOption,
  )
  const rewriteTimeoutMs = resolveField(
    "rewriteTimeoutMs",
    DEFAULTS.rewriteTimeoutMs,
    env.OPENCODE_HYPA_REWRITE_TIMEOUT_MS,
    parsePositiveInt,
    options?.rewriteTimeoutMs,
    parsePositiveIntOption,
  )
  const askNonInteractive = resolveField(
    "askNonInteractive",
    DEFAULTS.askNonInteractive,
    env.OPENCODE_HYPA_ASK_NON_INTERACTIVE,
    parseAsk,
    options?.askNonInteractive,
    parseAskOption,
  )
  const enabled = resolveField(
    "enabled",
    DEFAULTS.enabled,
    env.OPENCODE_HYPA_ENABLED,
    parseEnabled,
    options?.enabled,
    parseEnabledOption,
  )

  return {
    binary: binary.value,
    rewriteTimeoutMs: rewriteTimeoutMs.value,
    askNonInteractive: askNonInteractive.value,
    enabled: enabled.value,
    sources: {
      binary: binary.source,
      rewriteTimeoutMs: rewriteTimeoutMs.source,
      askNonInteractive: askNonInteractive.source,
      enabled: enabled.source,
    },
  }
}

export function parseRewriteJson(stdout: string): RewriteResultV1 {
  const payload = JSON.parse(stdout.trim()) as Partial<RewriteResultV1>
  if (typeof payload.input !== "string") {
    throw new Error("rewrite result missing string field: input")
  }
  if (typeof payload.outcome !== "string" || !VALID_OUTCOMES.has(payload.outcome as RewriteOutcome)) {
    throw new Error(`rewrite result has unknown outcome: ${String(payload.outcome)}`)
  }
  if (typeof payload.command !== "string") {
    throw new Error("rewrite result missing string field: command")
  }
  return payload as RewriteResultV1
}

export function mapRewriteResult(result: RewriteResultV1): RewriteStatus {
  switch (result.outcome) {
    case "Rewritten":
    case "GenericWrapper":
      return {
        kind: "rewritten",
        outcome: result.outcome,
        input: result.input,
        command: result.command,
      }
    case "Passthrough":
      return {
        kind: "passthrough",
        outcome: result.outcome,
        input: result.input,
        command: result.command,
      }
    case "Deny":
      return {
        kind: "deny",
        input: result.input,
        command: result.command,
        reason: `Command blocked by Hypa policy: ${result.input}`,
      }
    case "Ask":
      return {
        kind: "ask",
        input: result.input,
        command: result.command,
        reason: `Hypa requests confirmation before running: ${result.command || result.input}`,
      }
  }
}
