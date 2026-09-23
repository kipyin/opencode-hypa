export type RewriteOutcome = "Rewritten" | "GenericWrapper" | "Passthrough" | "Deny" | "Ask"

export type RewriteResultV1 = {
  input: string
  outcome: RewriteOutcome
  command: string
}

export type AskNonInteractivePolicy = "allow" | "deny"

export type ConfigSource = "env" | "options" | "default"

export type PluginOptions = {
  binary?: string
  rewriteTimeoutMs?: number
  askNonInteractive?: AskNonInteractivePolicy
  enabled?: boolean
}

export type HypaConfigSources = {
  binary: ConfigSource
  rewriteTimeoutMs: ConfigSource
  askNonInteractive: ConfigSource
  enabled: ConfigSource
}

export type HypaConfigWithSources = HypaConfig & {
  sources: HypaConfigSources
}

export type HypaConfig = {
  binary: string
  rewriteTimeoutMs: number
  askNonInteractive: AskNonInteractivePolicy
  enabled: boolean
}

export type RewriteStatus =
  | { kind: "rewritten"; outcome: "Rewritten" | "GenericWrapper"; input: string; command: string }
  | { kind: "passthrough"; outcome: "Passthrough"; input: string; command: string }
  | { kind: "deny"; input: string; command: string; reason: string }
  | { kind: "ask"; input: string; command: string; reason: string }
  | { kind: "skipped"; input: string; reason: string }
  | { kind: "error"; input: string; error: string }
