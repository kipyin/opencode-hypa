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

export const REWRITE_COMMAND_FIELDS = ["input", "command"] as const satisfies readonly Exclude<
  (typeof REWRITE_TRACE_FIELDS)[number],
  "outcome"
>[]

type MissingRewriteCommandField = Exclude<
  Exclude<(typeof REWRITE_TRACE_FIELDS)[number], "outcome">,
  (typeof REWRITE_COMMAND_FIELDS)[number]
>
const _allRewriteCommandFieldsListed: MissingRewriteCommandField extends never ? true : never = true

export type LastRewriteInput = Omit<LastRewrite, "timestamp"> & {
  timestamp?: number
}

function pickRecordFields<
  T extends Record<string, unknown>,
  F extends readonly (keyof T & string)[],
>(record: T, fields: F): Pick<T, F[number]> {
  const picked = {} as Pick<T, F[number]>
  for (const field of fields) {
    picked[field] = record[field]
  }
  return picked
}

export function pickRewriteTraceFields<T extends Record<(typeof REWRITE_TRACE_FIELDS)[number], unknown>>(
  record: T,
): Pick<T, (typeof REWRITE_TRACE_FIELDS)[number]> {
  return pickRecordFields(record, REWRITE_TRACE_FIELDS)
}

export function pickRewriteCommandFields<
  T extends Record<(typeof REWRITE_COMMAND_FIELDS)[number], unknown>,
>(record: T): Pick<T, (typeof REWRITE_COMMAND_FIELDS)[number]> {
  return pickRecordFields(record, REWRITE_COMMAND_FIELDS)
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
