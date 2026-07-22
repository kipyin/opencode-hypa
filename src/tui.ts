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

/**
 * OpenCode's Bun JSX transform skips packages under node_modules, so a published
 * `.jsx` entry cannot resolve `@opentui/solid/jsx-dev-runtime`. Keep this entry
 * free of JSX and call host UI factories as plain functions instead.
 */
async function showHypaDialog(api: TuiPluginApi): Promise<void> {
  await cacheHypaVersion(getHypaState().resolvedBinary)
  const text = formatHypaDiagnostics(snapshotDiagnosticsInput())

  api.ui.dialog.replace(
    () =>
      api.ui.DialogAlert({
        title: "Hypa diagnostics",
        message: text,
        onConfirm: () => api.ui.dialog.clear(),
      }),
    () => api.ui.dialog.clear(),
  )
}

const tui: TuiPlugin = async (api) => {
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

/**
 * TUI-only entry. OpenCode rejects modules that export both `server` and `tui`.
 * Package `exports["./tui"]` points here (compiled to `dist/tui.js`).
 */
export default {
  id: "opencode-hypa",
  tui,
}
