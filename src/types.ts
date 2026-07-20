export type RewriteOutcome = "Rewritten" | "GenericWrapper" | "Passthrough" | "Deny" | "Ask"

export type RewriteResultV1 = {
  input: string
  outcome: RewriteOutcome
  command: string
}

export type AskNonInteractivePolicy = "allow" | "deny"

export type HypaConfig = {
  /** Hypa executable name or absolute path. */
  binary: string
  /** Timeout for `hypa rewrite --json` in milliseconds. */
  rewriteTimeoutMs: number
  /** Behavior when Hypa returns Ask and no interactive UI is available. */
  askNonInteractive: AskNonInteractivePolicy
  /** When false, the plugin is a no-op. */
  enabled: boolean
}

export type RewriteStatus =
  | { kind: "rewritten"; outcome: "Rewritten" | "GenericWrapper"; input: string; command: string }
  | { kind: "passthrough"; outcome: "Passthrough"; input: string; command: string }
  | { kind: "deny"; input: string; command: string; reason: string }
  | { kind: "ask"; input: string; command: string; reason: string }
  | { kind: "skipped"; input: string; reason: string }
  | { kind: "error"; input: string; error: string }
