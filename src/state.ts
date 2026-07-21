import type { HypaConfigWithSources, RewriteOutcome } from "./types.js"

export type LastRewrite = {
  input: string
  command: string
  outcome: RewriteOutcome
  timestamp: number
}

export type HypaStateSnapshot = {
  resolvedBinary: string | undefined
  effectiveConfigWithSources: HypaConfigWithSources | undefined
  lastRewrite: LastRewrite | "none"
  hypaVersion: string | undefined
}

type HypaStateData = HypaStateSnapshot

function createInitialState(): HypaStateData {
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

export function setHypaLastRewrite(record: {
  input: string
  command: string
  outcome: RewriteOutcome
  timestamp?: number
}): void {
  state = {
    ...state,
    lastRewrite: {
      input: record.input,
      command: record.command,
      outcome: record.outcome,
      timestamp: record.timestamp ?? Date.now(),
    },
  }
}

export function clearHypaLastRewrite(): void {
  state = { ...state, lastRewrite: "none" }
}

export function setHypaVersion(hypaVersion: string): void {
  state = { ...state, hypaVersion }
}
