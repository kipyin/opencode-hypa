export type RewriteRecord = {
  input: string
  command: string
  outcome: "Rewritten" | "GenericWrapper"
}

export type ToolAfterOutput = {
  title: string
  output: string
  metadata: any
}

export function annotateRewrite(output: ToolAfterOutput, record: RewriteRecord): void {
  const note = `[hypa ${record.outcome}] ${record.input} => ${record.command}`

  const existingTitle = typeof output.title === "string" ? output.title : ""
  output.title = existingTitle ? `${note}\n${existingTitle}` : note

  const existingOutput = typeof output.output === "string" ? output.output : ""
  output.output = existingOutput ? `${note}\n\n${existingOutput}` : note

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