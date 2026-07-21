import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import { formatHypaDiagnostics, type HypaDiagnosticsInput } from "./diagnostics.js"
import { getExecArgs } from "./resolve.js"
import { getHypaState, setHypaVersion } from "./state.js"

let hypaVersionCached = false

function spawnHypaVersion(binary: string): Promise<string> {
  const [execBin, execArgs] = getExecArgs(binary, ["--version"])

  return new Promise((resolve, reject) => {
    const child = spawn(execBin, execArgs, { stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk)
    })

    child.on("error", reject)
    child.on("close", (code) => {
      if (code === 0) resolve(stdout.trim())
      else reject(new Error(`hypa --version exited with code ${code ?? "null"}`))
    })
  })
}

async function cacheHypaVersion(resolvedBinary: string | undefined): Promise<void> {
  if (hypaVersionCached) return
  if (!resolvedBinary) return

  hypaVersionCached = true

  if (!existsSync(resolvedBinary)) {
    setHypaVersion("")
    return
  }

  try {
    setHypaVersion(await spawnHypaVersion(resolvedBinary))
  } catch {
    setHypaVersion("")
  }
}

function snapshotDiagnosticsInput(): HypaDiagnosticsInput {
  const state = getHypaState()
  const binaryExists = state.resolvedBinary ? existsSync(state.resolvedBinary) : false
  return { ...state, binaryExists }
}

async function showHypaDialog(api: TuiPluginApi): Promise<void> {
  await cacheHypaVersion(getHypaState().resolvedBinary)
  const snapshot = snapshotDiagnosticsInput()
  const text = formatHypaDiagnostics(snapshot)
  const { Dialog } = api.ui

  api.ui.dialog.replace(
    () => (
      <Dialog onClose={() => api.ui.dialog.clear()}>
        <box flexDirection="column">
          <text>{text}</text>
        </box>
      </Dialog>
    ),
    () => api.ui.dialog.clear(),
  )
}

export const tui: TuiPlugin = async (api) => {
  await cacheHypaVersion(getHypaState().resolvedBinary)

  api.keymap.registerLayer({
    commands: [
      {
        name: "opencode-hypa.diagnostics",
        title: "Hypa diagnostics",
        category: "Hypa",
        namespace: "palette",
        slashName: "hypa",
        async run() {
          await showHypaDialog(api)
        },
      },
    ],
    bindings: [],
  })
}
