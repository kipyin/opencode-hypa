import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { annotateRewrite } from "../src/annotate.js"

describe("annotateRewrite", () => {
  it("prepends a hypa note to title, output, and sets metadata", () => {
    const output = {
      title: "hypa git log --oneline -10",
      output: "abc123 commit msg",
      metadata: { exit: 0 },
    }

    annotateRewrite(output, {
      input: "git log --oneline -10",
      command: "hypa git log --oneline -10",
      outcome: "Rewritten",
    })

    assert.equal(output.title, "[hypa Rewritten] git log --oneline -10 => hypa git log --oneline -10\nhypa git log --oneline -10")
    assert.equal(output.output, "[hypa Rewritten] git log --oneline -10 => hypa git log --oneline -10\n\nabc123 commit msg")
    assert.deepEqual(output.metadata, {
      exit: 0,
      hypaRewrite: {
        input: "git log --oneline -10",
        command: "hypa git log --oneline -10",
        outcome: "Rewritten",
      },
    })
  })

  it("handles empty title and output", () => {
    const output = {
      title: "",
      output: "",
      metadata: undefined,
    }

    annotateRewrite(output, {
      input: "pytest -q",
      command: "hypa -c pytest -q",
      outcome: "GenericWrapper",
    })

    assert.equal(output.title, "[hypa GenericWrapper] pytest -q => hypa -c pytest -q")
    assert.equal(output.output, "[hypa GenericWrapper] pytest -q => hypa -c pytest -q")
    assert.deepEqual(output.metadata, {
      hypaRewrite: {
        input: "pytest -q",
        command: "hypa -c pytest -q",
        outcome: "GenericWrapper",
      },
    })
  })

  it("preserves existing metadata fields", () => {
    const output = {
      title: "t",
      output: "o",
      metadata: { exit: 2, truncated: false, outputPath: "/tmp/x" },
    }

    annotateRewrite(output, {
      input: "ls",
      command: "hypa ls",
      outcome: "Rewritten",
    })

    assert.deepEqual(output.metadata, {
      exit: 2,
      truncated: false,
      outputPath: "/tmp/x",
      hypaRewrite: {
        input: "ls",
        command: "hypa ls",
        outcome: "Rewritten",
      },
    })
  })
})