const args = process.argv.slice(2)
if (args[0] === "rewrite" && args[1] === "--json" && typeof args[2] === "string") {
  const input = args[2]
  const outcome = process.env.HYPA_TEST_OUTCOME || "Rewritten"
  const command =
    outcome === "Rewritten" || outcome === "GenericWrapper"
      ? `hypa ${input}`
      : input

  process.stdout.write(JSON.stringify({ input, outcome, command }))
  process.exit(0)
}

process.stderr.write("unexpected invocation\n")
process.exit(1)
