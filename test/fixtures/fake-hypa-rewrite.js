const args = process.argv.slice(2)
if (args[0] === "rewrite" && args[1] === "--json" && typeof args[2] === "string") {
  process.stdout.write(
    JSON.stringify({
      input: args[2],
      outcome: "Rewritten",
      command: `hypa ${args[2]}`,
    }),
  )
  process.exit(0)
}

process.stderr.write("unexpected invocation\n")
process.exit(1)
