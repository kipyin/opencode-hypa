import type {
  AskNonInteractivePolicy,
  ConfigSource,
  HypaConfigWithSources,
  PluginOptions,
  RewriteOutcome,
  RewriteResultV1,
  RewriteStatus,
} from "./types.js"

const VALID_OUTCOMES = new Set<RewriteOutcome>([
  "Rewritten",
  "GenericWrapper",
  "Passthrough",
  "Deny",
  "Ask",
])

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

function resolveBinary(
  env: NodeJS.ProcessEnv,
  options: PluginOptions | undefined,
): { value: string; source: ConfigSource } {
  const envValue = env.OPENCODE_HYPA_BIN
  if (envValue !== undefined) {
    const trimmed = envValue.trim()
    if (trimmed) {
      return { value: trimmed, source: "env" }
    }
    warnInvalid("binary", envValue, DEFAULTS.binary)
    return { value: DEFAULTS.binary, source: "default" }
  }

  const optionValue = options?.binary
  if (optionValue !== undefined) {
    if (typeof optionValue === "string" && optionValue.trim()) {
      return { value: optionValue.trim(), source: "options" }
    }
    warnInvalid("binary", optionValue, DEFAULTS.binary)
    return { value: DEFAULTS.binary, source: "default" }
  }

  return { value: DEFAULTS.binary, source: "default" }
}

function resolveRewriteTimeoutMs(
  env: NodeJS.ProcessEnv,
  options: PluginOptions | undefined,
): { value: number; source: ConfigSource } {
  const envValue = env.OPENCODE_HYPA_REWRITE_TIMEOUT_MS
  if (envValue !== undefined) {
    const parsed = Number(envValue)
    if (Number.isInteger(parsed) && parsed > 0) {
      return { value: parsed, source: "env" }
    }
    warnInvalid("rewriteTimeoutMs", envValue, DEFAULTS.rewriteTimeoutMs)
    return { value: DEFAULTS.rewriteTimeoutMs, source: "default" }
  }

  const optionValue = options?.rewriteTimeoutMs
  if (optionValue !== undefined) {
    if (Number.isInteger(optionValue) && optionValue > 0) {
      return { value: optionValue, source: "options" }
    }
    warnInvalid("rewriteTimeoutMs", optionValue, DEFAULTS.rewriteTimeoutMs)
    return { value: DEFAULTS.rewriteTimeoutMs, source: "default" }
  }

  return { value: DEFAULTS.rewriteTimeoutMs, source: "default" }
}

function resolveAskNonInteractive(
  env: NodeJS.ProcessEnv,
  options: PluginOptions | undefined,
): { value: AskNonInteractivePolicy; source: ConfigSource } {
  const envValue = env.OPENCODE_HYPA_ASK_NON_INTERACTIVE
  if (envValue !== undefined) {
    const normalized = envValue.trim().toLowerCase()
    if (normalized === "allow" || normalized === "deny") {
      return { value: normalized, source: "env" }
    }
    warnInvalid("askNonInteractive", envValue, DEFAULTS.askNonInteractive)
    return { value: DEFAULTS.askNonInteractive, source: "default" }
  }

  const optionValue = options?.askNonInteractive
  if (optionValue !== undefined) {
    if (optionValue === "allow" || optionValue === "deny") {
      return { value: optionValue, source: "options" }
    }
    warnInvalid("askNonInteractive", optionValue, DEFAULTS.askNonInteractive)
    return { value: DEFAULTS.askNonInteractive, source: "default" }
  }

  return { value: DEFAULTS.askNonInteractive, source: "default" }
}

function resolveEnabled(
  env: NodeJS.ProcessEnv,
  options: PluginOptions | undefined,
): { value: boolean; source: ConfigSource } {
  const envValue = env.OPENCODE_HYPA_ENABLED
  if (envValue !== undefined) {
    const normalized = envValue.trim().toLowerCase()
    if (["0", "false", "no", "off"].includes(normalized)) {
      return { value: false, source: "env" }
    }
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return { value: true, source: "env" }
    }
    warnInvalid("enabled", envValue, DEFAULTS.enabled)
    return { value: DEFAULTS.enabled, source: "default" }
  }

  const optionValue = options?.enabled
  if (optionValue !== undefined) {
    if (typeof optionValue === "boolean") {
      return { value: optionValue, source: "options" }
    }
    warnInvalid("enabled", optionValue, DEFAULTS.enabled)
    return { value: DEFAULTS.enabled, source: "default" }
  }

  return { value: DEFAULTS.enabled, source: "default" }
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  options?: PluginOptions,
): HypaConfigWithSources {
  const binary = resolveBinary(env, options)
  const rewriteTimeoutMs = resolveRewriteTimeoutMs(env, options)
  const askNonInteractive = resolveAskNonInteractive(env, options)
  const enabled = resolveEnabled(env, options)

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

export function formatStatus(status: RewriteStatus | undefined): string {
  if (!status) return "none"
  switch (status.kind) {
    case "rewritten":
      return `${status.outcome}: ${status.input} => ${status.command}`
    case "passthrough":
      return `Passthrough: ${status.input}`
    case "deny":
      return `Deny: ${status.reason}`
    case "ask":
      return `Ask: ${status.reason}`
    case "skipped":
      return `Skipped: ${status.reason}`
    case "error":
      return `Error: ${status.error}`
  }
}
