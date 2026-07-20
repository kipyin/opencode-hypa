import { createRequire } from "node:module"
import { existsSync } from "node:fs"
import { dirname, join, posix, win32 } from "node:path"
import { platform } from "node:os"

const require = createRequire(import.meta.url)

const PLATFORM_MAP: Record<string, Record<string, string>> = {
  linux: { x64: "linux-x64", arm64: "linux-arm64" },
  darwin: { x64: "darwin-x64", arm64: "darwin-arm64" },
  win32: { x64: "win32-x64", arm64: "win32-arm64" },
}

type RequireResolve = (id: string) => string

function isJsEntry(path: string): boolean {
  return /\.js$/i.test(path)
}

/**
 * Normalise spawn args so `.js` entrypoints always run under the host runtime.
 * On Windows, wrap `.cmd`/`.bat` with `cmd /c`.
 */
export function getExecArgs(
  binary: string,
  args: string[],
  platformName: string = platform(),
  jsRuntime: string = process.execPath,
): [string, string[]] {
  const lower = binary.toLowerCase()
  if (lower.endsWith(".js")) return [jsRuntime, [binary, ...args]]
  if (platformName === "win32" && (lower.endsWith(".cmd") || lower.endsWith(".bat"))) {
    return ["cmd", ["/c", binary, ...args]]
  }
  return [binary, args]
}

export function resolveNativeHypaBinary(
  exists: (p: string) => boolean = existsSync,
  requireResolve: RequireResolve = require.resolve.bind(require),
  platformName: string = platform(),
  archName: string = process.arch,
): string | undefined {
  const archKey = PLATFORM_MAP[platformName]?.[archName]
  if (!archKey) return undefined

  const pkgName = `@hypabolic/hypa-${archKey}`
  try {
    const packageJson = requireResolve(`${pkgName}/package.json`)
    const packageRoot = dirname(packageJson)
    const binaryName = platformName === "win32" ? "hypa.exe" : "hypa"
    const binaryPath = join(packageRoot, "bin", binaryName)
    return exists(binaryPath) ? binaryPath : undefined
  } catch {
    return undefined
  }
}

function resolveBundledJsHypaBinary(
  binary: string,
  exists: (p: string) => boolean,
  requireResolve: RequireResolve,
): string | undefined {
  if (binary !== "hypa") return undefined
  try {
    const packageJson = requireResolve("@hypabolic/hypa/package.json")
    const bin = join(dirname(packageJson), "bin.js")
    return exists(bin) ? bin : undefined
  } catch {
    return undefined
  }
}

function resolvePathBinary(
  binary: string,
  env: NodeJS.ProcessEnv,
  platformName: string,
  exists: (p: string) => boolean,
): string | undefined {
  const pathEnv = env.PATH
  if (!pathEnv) return undefined

  const isWindows = platformName === "win32"
  const pathDelimiter = isWindows ? ";" : ":"
  const resolvePath = isWindows ? win32.resolve : posix.resolve
  const executableExtensions = isWindows ? getWindowsExecutableExtensions(env) : []
  const binaryLower = binary.toLowerCase()
  const hasExecutableExtension =
    isWindows &&
    executableExtensions.some((extension) => binaryLower.endsWith(extension.toLowerCase()))

  for (const dir of pathEnv.split(pathDelimiter)) {
    if (!dir) continue
    const candidate = resolvePath(dir, binary)

    if (!isWindows) {
      if (exists(candidate)) return candidate
      continue
    }

    if (hasExecutableExtension) {
      if (exists(candidate)) return candidate
      continue
    }

    for (const extension of executableExtensions) {
      const executableCandidate = `${candidate}${extension}`
      if (exists(executableCandidate)) return executableCandidate
    }
  }

  return undefined
}

function getWindowsExecutableExtensions(env: NodeJS.ProcessEnv): string[] {
  const rawExtensions = env.PATHEXT?.trim() ? env.PATHEXT : ".COM;.EXE;.BAT;.CMD"
  const extensions: string[] = []
  const seen = new Set<string>()

  for (const extension of rawExtensions.split(";")) {
    const trimmed = extension.trim()
    if (!trimmed) continue
    const normalized = trimmed.startsWith(".") ? trimmed : `.${trimmed}`
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    extensions.push(normalized)
  }

  for (const extension of [".exe", ".cmd"]) {
    const key = extension.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    extensions.push(extension)
  }

  return extensions
}

/**
 * Resolve order for bare names like `hypa`:
 * 1. Absolute/relative path → as-is
 * 2. Windows: native bundled binary
 * 3. PATH non-JS candidate
 * 4. Native bundled binary
 * 5. PATH JS candidate
 * 6. bin.js fallback
 * 7. bare name
 */
export function resolveHypaBinary(
  binary: string,
  env: NodeJS.ProcessEnv = process.env,
  platformName: string = platform(),
  exists: (p: string) => boolean = existsSync,
  requireResolve: RequireResolve = require.resolve.bind(require),
): string {
  if (binary.includes("/") || binary.includes("\\")) return binary

  if (platformName === "win32") {
    const nativeBinary = resolveNativeHypaBinary(exists, requireResolve, platformName)
    if (nativeBinary) return nativeBinary
  }

  const pathBinary = resolvePathBinary(binary, env, platformName, exists)
  if (pathBinary && !isJsEntry(pathBinary)) return pathBinary

  const nativeBinary = resolveNativeHypaBinary(exists, requireResolve, platformName)
  if (nativeBinary) return nativeBinary

  if (pathBinary) return pathBinary

  const jsBundled = resolveBundledJsHypaBinary(binary, exists, requireResolve)
  if (jsBundled) return jsBundled

  return binary
}
