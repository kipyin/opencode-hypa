export type RewriteRecord = {
  input: string
  command: string
  outcome: "Rewritten" | "GenericWrapper" | "Ask"
}

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
    hypaRewrite: {
      input: record.input,
      command: record.command,
      outcome: record.outcome,
    },
  }
}