export const REWRITE_OUTCOMES = [
  "Rewritten",
  "GenericWrapper",
  "Passthrough",
  "Deny",
  "Ask",
] as const

export type RewriteOutcome = (typeof REWRITE_OUTCOMES)[number]

export type RewriteResultV1 = {
  input: string
  outcome: RewriteOutcome
  command: string
}

export const ASK_NON_INTERACTIVE_POLICIES = ["allow", "deny"] as const

export type AskNonInteractivePolicy = (typeof ASK_NON_INTERACTIVE_POLICIES)[number]

export type ConfigSource = "env" | "options" | "default"

export type HypaConfig = {
  binary: string
  rewriteTimeoutMs: number
  askNonInteractive: AskNonInteractivePolicy
  enabled: boolean
}

export type PluginOptions = Partial<HypaConfig>

export type HypaConfigSources = {
  [K in keyof HypaConfig]: ConfigSource
}

export type HypaConfigWithSources = HypaConfig & {
  sources: HypaConfigSources
}

export type RewriteStatus =
  | { kind: "rewritten"; outcome: "Rewritten" | "GenericWrapper"; input: string; command: string }
  | { kind: "passthrough"; outcome: "Passthrough"; input: string; command: string }
  | { kind: "deny"; input: string; command: string; reason: string }
  | { kind: "ask"; input: string; command: string; reason: string }
  | { kind: "skipped"; input: string; reason: string }
  | { kind: "error"; input: string; error: string }
