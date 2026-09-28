import type { HypaConfigWithSources, RewriteOutcome } from "./types.js"

export type LastRewrite = {
  input: string
  command: string
  outcome: RewriteOutcome
  timestamp: number
}

export const REWRITE_TRACE_FIELDS = ["input", "command", "outcome"] as const satisfies readonly (keyof Omit<
  LastRewrite,
  "timestamp"
>)[]

type MissingRewriteTraceField = Exclude<
  keyof Omit<LastRewrite, "timestamp">,
  (typeof REWRITE_TRACE_FIELDS)[number]
>
const _allRewriteTraceFieldsListed: MissingRewriteTraceField extends never ? true : never = true

export type LastRewriteInput = Omit<LastRewrite, "timestamp"> & {
  timestamp?: number
}

export function pickRewriteTraceFields<T extends Record<(typeof REWRITE_TRACE_FIELDS)[number], unknown>>(
  record: T,
): Pick<T, (typeof REWRITE_TRACE_FIELDS)[number]> {
  const picked = {} as Pick<T, (typeof REWRITE_TRACE_FIELDS)[number]>
  for (const field of REWRITE_TRACE_FIELDS) {
    picked[field] = record[field]
  }
  return picked
}

export type HypaStateSnapshot = {
  resolvedBinary: string | undefined
  effectiveConfigWithSources: HypaConfigWithSources | undefined
  lastRewrite: LastRewrite | "none"
  hypaVersion: string | undefined
}

function createInitialState(): HypaStateSnapshot {
  return {
    resolvedBinary: undefined,
    effectiveConfigWithSources: undefined,
    lastRewrite: "none",
    hypaVersion: undefined,
  }
}

let state = createInitialState()

export function getHypaState(): Readonly<HypaStateSnapshot> {
  return state
}

export function resetHypaState(): void {
  state = createInitialState()
}

export function setHypaResolvedBinary(resolvedBinary: string): void {
  state = { ...state, resolvedBinary }
}

export function setHypaEffectiveConfigWithSources(
  effectiveConfigWithSources: HypaConfigWithSources,
): void {
  state = { ...state, effectiveConfigWithSources }
}

export function setHypaLastRewrite(record: LastRewriteInput): void {
  state = {
    ...state,
    lastRewrite: {
      ...pickRewriteTraceFields(record),
      timestamp: record.timestamp ?? Date.now(),
    },
  }
}

export function setHypaVersion(hypaVersion: string): void {
  state = { ...state, hypaVersion }
}
