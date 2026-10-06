import { pickRewriteTraceFields, REWRITE_TRACE_FIELDS } from "./state.js"
import type { AnnotatedRewriteOutcome, RewriteResultV1 } from "./types.js"

export type RewriteRecord = Omit<RewriteResultV1, "outcome"> & {
  outcome: AnnotatedRewriteOutcome
}

type MissingRewriteRecordField = Exclude<keyof RewriteRecord, (typeof REWRITE_TRACE_FIELDS)[number]>
const _allRewriteRecordFieldsListed: MissingRewriteRecordField extends never ? true : never = true

export type ToolAfterOutput = {
  title: string
  output: string
  metadata: any
}

function prependNote(existing: unknown, note: string, separator: "\n" | "\n\n"): string {
  const text = typeof existing === "string" ? existing : ""
  return text ? `${note}${separator}${text}` : note
}

export function annotateRewrite(output: ToolAfterOutput, record: RewriteRecord): void {
  const note = `[hypa ${record.outcome}] ${record.input} => ${record.command}`

  output.title = prependNote(output.title, note, "\n")
  output.output = prependNote(output.output, note, "\n\n")

  const existingMetadata =
    output.metadata && typeof output.metadata === "object" ? output.metadata : {}
  output.metadata = {
    ...existingMetadata,
    hypaRewrite: pickRewriteTraceFields(record),
  }
}