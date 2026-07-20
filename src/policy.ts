import type {
  AskNonInteractivePolicy,
  HypaConfig,
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

export function isBashTool(tool: string): boolean {
  return BASH_TOOLS.has(tool)
}

export function isHypaCommand(command: string): boolean {
  const trimmed = command.trimStart()
  return trimmed === "hypa" || trimmed.startsWith("hypa ")
}

export function parseAskNonInteractive(value: string | undefined): AskNonInteractivePolicy {
  return value?.trim().toLowerCase() === "allow" ? "allow" : "deny"
}

export function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function parseBooleanFlag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback
  const normalized = value.trim().toLowerCase()
  if (["0", "false", "no", "off"].includes(normalized)) return false
  if (["1", "true", "yes", "on"].includes(normalized)) return true
  return fallback
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): HypaConfig {
  return {
    binary: env.HYPA_BIN?.trim() || "hypa",
    rewriteTimeoutMs: parsePositiveInteger(env.OPENCODE_HYPA_REWRITE_TIMEOUT_MS, 5000),
    askNonInteractive: parseAskNonInteractive(env.OPENCODE_HYPA_ASK_NON_INTERACTIVE),
    enabled: parseBooleanFlag(env.OPENCODE_HYPA_ENABLED, true),
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
