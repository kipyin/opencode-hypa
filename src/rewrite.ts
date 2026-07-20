import { spawn } from "node:child_process"
import type { HypaConfig, RewriteStatus } from "./types.js"
import { isHypaCommand, mapRewriteResult, parseRewriteJson } from "./policy.js"
import { getExecArgs, resolveHypaBinary } from "./resolve.js"

async function runRewrite(
  binary: string,
  command: string,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; code: number | null; timedOut: boolean }> {
  const [execBin, execArgs] = getExecArgs(binary, ["rewrite", "--json", command])

  return await new Promise((resolve, reject) => {
    const child = spawn(execBin, execArgs, {
      stdio: ["ignore", "pipe", "pipe"],
    })

    let stdout = ""
    let stderr = ""
    let settled = false
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      child.kill("SIGTERM")
    }, timeoutMs)

    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk
    })
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk
    })

    child.on("error", (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
    })

    child.on("close", (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ stdout, stderr, code, timedOut })
    })
  })
}

export async function rewriteCommand(
  config: HypaConfig,
  command: string,
): Promise<RewriteStatus> {
  if (isHypaCommand(command)) {
    return { kind: "skipped", input: command, reason: "command already starts with hypa" }
  }

  const binary = resolveHypaBinary(config.binary)

  try {
    const result = await runRewrite(binary, command, config.rewriteTimeoutMs)

    if (result.timedOut) {
      return {
        kind: "error",
        input: command,
        error: `hypa rewrite timed out after ${config.rewriteTimeoutMs}ms`,
      }
    }

    if (!result.stdout.trim()) {
      const detail = result.stderr.trim() || `exit code ${result.code}`
      return {
        kind: "error",
        input: command,
        error: `hypa rewrite produced no JSON (${detail})`,
      }
    }

    return mapRewriteResult(parseRewriteJson(result.stdout))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { kind: "error", input: command, error: message }
  }
}
