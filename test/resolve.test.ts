import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { dirname, join, posix, win32 } from "node:path"
import { getExecArgs, resolveHypaBinary } from "../src/resolve.js"

const JS_PACKAGE_ID = "@hypabolic/hypa/package.json"

const NATIVE_ARCH: Record<string, Record<string, string>> = {
  linux: { x64: "linux-x64", arm64: "linux-arm64" },
  darwin: { x64: "darwin-x64", arm64: "darwin-arm64" },
  win32: { x64: "win32-x64", arm64: "win32-arm64" },
}

type Deps = {
  exists: (path: string) => boolean
  requireResolve: (id: string) => string
  existsCalls: string[]
  resolveCalls: string[]
}

function nativePackageId(platformName: string): string {
  const archKey = NATIVE_ARCH[platformName]?.[process.arch]
  if (!archKey) {
    throw new Error(`no native package for ${platformName}/${process.arch}`)
  }
  return `@hypabolic/hypa-${archKey}/package.json`
}

function nativeBinaryPath(platformName: string, packageJson: string): string {
  const binaryName = platformName === "win32" ? "hypa.exe" : "hypa"
  return join(dirname(packageJson), "bin", binaryName)
}

function pathCandidate(platformName: string, dir: string, name: string): string {
  const resolve = platformName === "win32" ? win32.resolve : posix.resolve
  return resolve(dir, name)
}

function createDeps(options: {
  files?: Iterable<string>
  packages?: Record<string, string>
}): Deps {
  const files = new Set(options.files ?? [])
  const packages = options.packages ?? {}
  const existsCalls: string[] = []
  const resolveCalls: string[] = []

  return {
    existsCalls,
    resolveCalls,
    exists: (path) => {
      existsCalls.push(path)
      return files.has(path)
    },
    requireResolve: (id) => {
      resolveCalls.push(id)
      const resolved = packages[id]
      if (resolved === undefined) {
        throw new Error(`Cannot find module '${id}'`)
      }
      return resolved
    },
  }
}

function resolveBare(
  binary: string,
  platformName: string,
  env: NodeJS.ProcessEnv,
  deps: Deps,
): string {
  return resolveHypaBinary(binary, env, platformName, deps.exists, deps.requireResolve)
}

function count(calls: string[], expected: string): number {
  return calls.filter((call) => call === expected).length
}

describe("resolveHypaBinary", () => {
  it("returns an absolute or relative path as-is", () => {
    const deps = createDeps({})
    const paths = ["/usr/local/bin/hypa", "./bin/hypa", String.raw`C:\Tools\hypa.exe`, "tools/hypa"]

    for (const binary of paths) {
      assert.equal(resolveBare(binary, "linux", { PATH: "/usr/bin" }, deps), binary)
    }

    assert.deepEqual(deps.existsCalls, [])
    assert.deepEqual(deps.resolveCalls, [])
  })

  it("on Windows, resolves the native bundled binary before PATH", () => {
    const platformName = "win32"
    const packageJson = "/virtual/win32/package.json"
    const nativeBin = nativeBinaryPath(platformName, packageJson)
    const pathExe = `${pathCandidate(platformName, String.raw`C:\Tools`, "hypa")}.EXE`
    const nativeId = nativePackageId(platformName)
    const deps = createDeps({
      files: [nativeBin, pathExe],
      packages: { [nativeId]: packageJson },
    })

    assert.equal(
      resolveBare("hypa", platformName, { PATH: String.raw`C:\Tools` }, deps),
      nativeBin,
    )
    assert.equal(deps.existsCalls.includes(pathExe), false)
    assert.deepEqual(deps.resolveCalls, [nativeId])
  })

  it("on non-Windows, resolves a PATH non-JS candidate before the native bundled binary", () => {
    const platformName = "linux"
    const packageJson = "/virtual/linux/package.json"
    const nativeBin = nativeBinaryPath(platformName, packageJson)
    const pathBin = pathCandidate(platformName, "/usr/bin", "hypa")
    const nativeId = nativePackageId(platformName)
    const deps = createDeps({
      files: [nativeBin, pathBin],
      packages: { [nativeId]: packageJson },
    })

    assert.equal(resolveBare("hypa", platformName, { PATH: "/usr/bin" }, deps), pathBin)
    assert.equal(count(deps.resolveCalls, nativeId), 0)
  })

  it("resolves the native bundled binary after a missing PATH non-JS candidate", () => {
    const platformName = "linux"
    const packageJson = "/virtual/linux/package.json"
    const nativeBin = nativeBinaryPath(platformName, packageJson)
    const nativeId = nativePackageId(platformName)
    const deps = createDeps({
      files: [nativeBin],
      packages: { [nativeId]: packageJson },
    })

    assert.equal(resolveBare("hypa", platformName, { PATH: "/usr/bin" }, deps), nativeBin)
    assert.deepEqual(deps.resolveCalls, [nativeId])
  })

  it("resolves the native bundled binary before a PATH .js candidate", () => {
    const platformName = "linux"
    const packageJson = "/virtual/linux/package.json"
    const nativeBin = nativeBinaryPath(platformName, packageJson)
    const pathJs = pathCandidate(platformName, "/opt/js", "hypa.js")
    const nativeId = nativePackageId(platformName)
    const deps = createDeps({
      files: [nativeBin, pathJs],
      packages: { [nativeId]: packageJson },
    })

    assert.equal(resolveBare("hypa.js", platformName, { PATH: "/opt/js" }, deps), nativeBin)
    assert.deepEqual(deps.resolveCalls, [nativeId])
  })

  it("resolves a PATH .js candidate only after the native bundled binary misses", () => {
    const linuxJs = pathCandidate("linux", "/opt/js", "hypa.js")
    const linux = createDeps({ files: [linuxJs] })
    assert.equal(resolveBare("hypa.js", "linux", { PATH: "/opt/js" }, linux), linuxJs)
    assert.equal(count(linux.resolveCalls, nativePackageId("linux")), 1)

    const win32Js = `${pathCandidate("win32", String.raw`C:\bin`, "hypa")}.JS`
    const winPackageJson = "/virtual/win32/package.json"
    const winNative = nativeBinaryPath("win32", winPackageJson)
    const winNativeId = nativePackageId("win32")
    const windows = createDeps({
      files: [win32Js],
      packages: { [winNativeId]: winPackageJson },
    })

    assert.equal(
      resolveBare("hypa", "win32", { PATH: String.raw`C:\bin`, PATHEXT: ".JS" }, windows),
      win32Js,
    )
    assert.equal(count(windows.resolveCalls, winNativeId), 1)
    assert.equal(count(windows.existsCalls, winNative), 1)
  })

  it("falls back to bundled bin.js when native and PATH miss", () => {
    const packageJson = "/virtual/hypa/package.json"
    const binJs = join(dirname(packageJson), "bin.js")
    const deps = createDeps({
      files: [binJs],
      packages: { [JS_PACKAGE_ID]: packageJson },
    })

    assert.equal(resolveBare("hypa", "linux", { PATH: "/usr/bin" }, deps), binJs)
    assert.equal(count(deps.resolveCalls, JS_PACKAGE_ID), 1)
  })

  it("returns the bare name when native, PATH, and bin.js miss", () => {
    const deps = createDeps({})

    assert.equal(resolveBare("hypa", "linux", { PATH: "/usr/bin" }, deps), "hypa")
    assert.equal(count(deps.resolveCalls, nativePackageId("linux")), 1)
    assert.equal(count(deps.resolveCalls, JS_PACKAGE_ID), 1)
  })

  it("returns a non-hypa bare name without using bundled bin.js", () => {
    const packageJson = "/virtual/hypa/package.json"
    const binJs = join(dirname(packageJson), "bin.js")
    const deps = createDeps({
      files: [binJs],
      packages: { [JS_PACKAGE_ID]: packageJson },
    })

    assert.equal(resolveBare("other", "linux", { PATH: "/usr/bin" }, deps), "other")
    assert.equal(count(deps.resolveCalls, JS_PACKAGE_ID), 0)
  })

  it("on Windows, returns a PATH hit that already has an executable extension", () => {
    const pathCmd = pathCandidate("win32", String.raw`C:\Tools`, "hypa.cmd")
    const deps = createDeps({ files: [pathCmd] })

    assert.equal(
      resolveBare(
        "hypa.cmd",
        "win32",
        { PATH: String.raw`C:\Tools`, PATHEXT: ".COM;.EXE;.BAT;.CMD" },
        deps,
      ),
      pathCmd,
    )
    assert.deepEqual(deps.existsCalls, [pathCmd])
  })

  it("on Windows, does not append PATHEXT when the name already has an extension", () => {
    const pathCmd = pathCandidate("win32", String.raw`C:\Tools`, "hypa.cmd")
    const deps = createDeps({ files: [`${pathCmd}.EXE`] })

    assert.equal(
      resolveBare(
        "hypa.cmd",
        "win32",
        { PATH: String.raw`C:\Tools`, PATHEXT: ".COM;.EXE;.BAT;.CMD" },
        deps,
      ),
      "hypa.cmd",
    )
    assert.deepEqual(deps.existsCalls, [pathCmd])
  })

  it("does not resolve the native binary again after a Windows native miss", () => {
    const nativeId = nativePackageId("win32")
    const deps = createDeps({})

    assert.equal(resolveBare("hypa", "win32", { PATH: String.raw`C:\missing` }, deps), "hypa")
    assert.equal(count(deps.resolveCalls, nativeId), 1)
  })
})

describe("getExecArgs", () => {
  it("runs a .js entry under the host runtime", () => {
    assert.deepEqual(getExecArgs("/opt/hypa/bin.js", ["rewrite", "--json", "git status"]), [
      process.execPath,
      ["/opt/hypa/bin.js", "rewrite", "--json", "git status"],
    ])
    assert.deepEqual(getExecArgs(String.raw`C:\hypa\bin.JS`, ["--version"], "win32"), [
      process.execPath,
      [String.raw`C:\hypa\bin.JS`, "--version"],
    ])
  })

  it("wraps win32 .cmd and .bat with cmd /c", () => {
    assert.deepEqual(getExecArgs(String.raw`C:\hypa\hypa.cmd`, ["rewrite"], "win32"), [
      "cmd",
      ["/c", String.raw`C:\hypa\hypa.cmd`, "rewrite"],
    ])
    assert.deepEqual(getExecArgs(String.raw`C:\hypa\hypa.BAT`, ["--version"], "win32"), [
      "cmd",
      ["/c", String.raw`C:\hypa\hypa.BAT`, "--version"],
    ])
    assert.deepEqual(getExecArgs("/usr/bin/hypa.cmd", ["--version"], "linux"), [
      "/usr/bin/hypa.cmd",
      ["--version"],
    ])
  })
})
