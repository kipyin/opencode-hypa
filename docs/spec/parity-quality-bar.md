# Parity/Quality Bar for opencode-hypa

**Status:** Shipped v1 — keep this document aligned with the tree. Collapses wayfinder map #1 and grilling tickets #6, #7, #8, #9, #11.

## Problem Statement

OpenCode users running `bash` / `shell` tool calls against a local codebase lose context to noisy command output (test runs, git logs, build spam). Hypa compresses that output locally and deterministically, but only if the model is made to call `hypa rewrite`-style wrappers instead of raw commands. Pi ships an official hardwire for this (`@hypabolic/pi-hypa`); OpenCode has none. Users who want the same automatic context savings in OpenCode currently have to remember to prefix every command with `hypa` themselves, or run Hypa as an MCP server the model has to opt into per-call.

opencode-hypa is the missing hardwire: a server + TUI plugin that intercepts every `bash` / `shell` tool call, rewrites it through `hypa rewrite --json` before execution, and annotates the tool result so the LLM and operator can see what changed.

## Solution

A single OpenCode plugin package (`opencode-hypa`) with two package exports (`./server` and `./tui`):

- a **server plugin** that registers `tool.execute.before` (rewrite the command) and `tool.execute.after` (annotate the tool result the LLM sees; record state for the diagnostics command);
- a **TUI plugin** that registers a `/hypa` slash command opening a modal diagnostics dialog showing resolved binary, hypa version, effective config (with per-field source), enabled flag, and the last rewrite.

Configuration is OpenCode-native: the `plugin` tuple's `PluginOptions` second element, overridable per field by `OPENCODE_HYPA_*` env vars, resolved once at plugin load. No sidecar file, no postinstall shim.

The parity bar is `@hypabolic/pi-hypa`: every behavior Pi hardwires for Pi, opencode-hypa hardwires for OpenCode — rewrites, fail-open, hypa-prefix skip, AbortSignal-aware cancellation, operator diagnostics. Behaviors Pi has that depend on a host API OpenCode doesn't expose (interactive `Ask` confirmation) are explicitly out of scope for v1 and gated on a future OpenCode release.

## User Stories

1. As an OpenCode user, I want every `bash` / `shell` command I run to be automatically rewritten through `hypa rewrite`, so that I don't have to remember to prefix commands with `hypa` myself.
2. As an OpenCode user, I want commands that already start with `hypa` to be left alone, so that I don't get double-wrapped commands.
3. As an OpenCode user, I want the plugin to fail open — run my original command unchanged — when `hypa rewrite` errors or times out, so that a broken Hypa install never blocks my work.
4. As an OpenCode user, I want the LLM to see that a command was rewritten (input → command, outcome), so that it doesn't rationalize the `hypa` prefix as its own typo.
5. As an OpenCode user, I want Hypa `Deny` outcomes to block the tool call, so that Hypa's safety policy is enforced.
6. As an OpenCode user, I want Hypa `Ask` outcomes to block by default, so that I'm not surprised by a command Hypa flagged for confirmation.
7. As an OpenCode user, I want the option to proceed with Hypa `Ask` outcomes non-interactively, so that I can run unattended (CI, batch) without manual confirmation.
8. As an OpenCode user, I want a running rewrite to be cancelled when the host cancels the tool call, so that an escaped bash call doesn't keep a `hypa` child running in the background.
9. As an operator, I want a `/hypa` slash command in the TUI, so that I can see the plugin's state without leaving OpenCode.
10. As an operator, I want `/hypa` to show the resolved binary path and whether it exists, so that I can diagnose "why isn't Hypa being called."
11. As an operator, I want `/hypa` to show the installed Hypa version, so that I can confirm I'm running the release I think I am.
12. As an operator, I want `/hypa` to show the effective config with a per-field source tag (env / options / default), so that I can tell which layer is overriding what.
13. As an operator, I want `/hypa` to show the last rewrite (input → command, outcome, timestamp) or `none`, so that I can verify the plugin is actually rewriting.
14. As an operator, I want `/hypa` to show whether the plugin is enabled, so that I can tell at a glance if I'm looking at a disabled-plugin problem.
15. As a user configuring the plugin, I want to set `binary`, `rewriteTimeoutMs`, `askNonInteractive`, and `enabled` in `opencode.json` via the `plugin` tuple, so that I can commit my config alongside the rest of my OpenCode config.
16. As a user configuring the plugin, I want to override any option with an `OPENCODE_HYPA_*` env var, so that I can change behavior per-shell or per-CI-run without editing `opencode.json`.
17. As a user configuring the plugin, I want invalid option values to fall back to defaults with a warning rather than crash the plugin, so that a typo in `opencode.json` doesn't take down my session.
18. As a maintainer, I want the plugin published to npm under semver with a keep-a-changelog `CHANGELOG.md`, so that I can ship versioned releases with auditable changes.
19. As a maintainer, I want CI to run on Node 22 against a minimum of Node 18, so that I catch compatibility breaks before release.
20. As a maintainer, I want releases to publish via GitHub Trusted Publisher OIDC, so that no long-lived npm token is stored in the repo.
21. As a maintainer, I want unit tests for policy, rewrite, annotate, and resolve covering pure-function behavior, so that I can refactor with confidence.
22. As a maintainer, I want one mocked-rewrite hook integration test exercising `tool.execute.before` + `tool.execute.after` end-to-end, so that the plugin's actual hook wiring is verified, not just its pieces.
23. As a maintainer, I want the TUI diagnostics formatter tested as a pure function, so that the dialog contents are locked without depending on the OpenCode TUI runtime.

## Implementation Decisions

### Plugin entry shape

OpenCode rejects a combined `{ server, tui }` `PluginModule` (since 1.0.1). The package ships two entries, locked by `package.json` `exports` and `test/plugin-entry.test.ts`:

- `exports["./server"]` → `dist/index.js` — server-only `{ id, server }` (`tui` must not be present)
- `exports["./tui"]` → `dist/tui.js` — TUI-only `{ id, tui }` (`server` must not be present)

The legacy loader treats every exported function as an entrypoint, so no helper functions are re-exported from the server entry module.

- **Server entry signature:** `Plugin` — `server(input, options?)` receives the `PluginOptions` tuple element directly. `loadConfig(env, options?)` mirrors.
- **TUI entry signature:** `TuiPlugin` — `tui(api, options, meta)` registers `/hypa` via `api.keymap.registerLayer({ commands, bindings })` (current, non-deprecated API; `api.command` is deprecated for v2).

### Rewrite contract (parity with `@hypabolic/pi-hypa`)

Unchanged behavior, locked as spec:

- **Tool names covered:** `bash` and `shell`. Aliases added when OpenCode upstream adds them; not user-configurable in v1.
- **Skip rule:** commands whose trimmed form is `hypa` or starts with `hypa ` are never rewritten.
- **Outcomes handled:** `Rewritten` / `GenericWrapper` → replace command, record rewrite; `Passthrough` → leave command; `Deny` → throw; `Ask` → policy-gated (see Ask handling); error/timeout → fail open, leave command.
- **Fail-open:** any spawn error, timeout, or non-JSON stdout leaves the original command unchanged. No throw from the rewrite path on error.
- **AbortSignal:** `tool.execute.before`'s `input.signal` is threaded into the rewrite call. When the signal aborts, the `hypa` child is killed and the rewrite returns an error status (which fail-opens to the original command). Wired defensively — if OpenCode does not populate `input.signal` today, the path is a no-op until it does.

### Config surface

Fields (all optional in `PluginOptions`):

| Field | Type | Default | Env var |
|---|---|---|---|
| `binary` | `string` | `"hypa"` | `OPENCODE_HYPA_BIN` |
| `rewriteTimeoutMs` | `number` (positive int) | `5000` | `OPENCODE_HYPA_REWRITE_TIMEOUT_MS` |
| `askNonInteractive` | `"allow" \| "deny"` | `"deny"` | `OPENCODE_HYPA_ASK_NON_INTERACTIVE` |
| `enabled` | `boolean` | `true` | `OPENCODE_HYPA_ENABLED` |

- **Keys** in `opencode.json`: camelCase (matches `HypaConfig` field names and OpenCode plugin conventions).
- **Precedence:** env > options > defaults, resolved once at plugin load in `loadConfig(env, options?)`.
- **Invalid values** (wrong type, out of range, unknown enum): `console.warn` + fall back to the default for that field. Other fields still load. No throw at load time.
- **Backward compat:** `loadConfig(env)` still works; omitting the tuple's second element yields all-env-or-defaults behavior.
- **Renames:** `HYPA_BIN` → `OPENCODE_HYPA_BIN` (no users yet; zero-cost normalization to the `OPENCODE_HYPA_*` prefix).

### Source metadata (imposed by diagnostics)

`loadConfig` returns a richer shape that records, per field, whether the effective value came from `env`, `options`, or `default`. The existing `HypaConfig` (values only) is preserved for the rewrite path; a parallel `HypaConfigWithSources` (values + per-field source tag) is consumed by the diagnostics command. This is the one new surface #7 imposes on #6's schema.

### Diagnostics command (`/hypa`)

- **Name:** `/hypa`, hardcoded. Not configurable via `PluginOptions` in v1.
- **Registration:** `api.keymap.registerLayer({ commands, bindings })` — `commands` declares the slash command `hypa`; `bindings` empty (no default keybind in v1).
- **Display:** `api.ui.DialogAlert` (title + message) pushed through `api.ui.dialog.replace`, confirm-dismissed. Snapshot on open (re-open to refresh). Not `api.ui.Dialog` — OpenCode's Bun JSX transform skips packages under `node_modules`, so the TUI entry stays JSX-free and uses host UI factories.
- **Missing binary:** renders an in-dialog error state with the missing path; no crash.
- **Status fields (five):**
  1. `enabled` flag (true/false).
  2. Resolved binary path + existence check (`exists: true/false`).
  3. `hypa` version string — spawned once at TUI plugin load via `hypa --version`, cached in module state. Empty/error string if the spawn fails.
  4. Effective config: each of the four fields with value and source tag (`(env)` / `(options)` / `(default)`).
  5. Last rewrite: `{ input, command, outcome, timestamp }` or `none`.

### State bridge (server → TUI)

- **Mechanism:** in-process module (`src/state.ts` singleton). The TUI entry imports the singleton directly. No RPC (OpenCode SDK exposes no plugin-to-plugin RPC), no `api.kv`, no disk file, no TUI-local fallback.
- **Server writes via:** `tool.execute.before` / `tool.execute.after` plus a load-time snapshot of `resolvedBinary` and `effectiveConfigWithSources`. `applyRewrite` publishes `lastRewrite` when a rewrite is applied.
- **History depth:** last rewrite only (matches Pi). The per-callID `rewrites` Map is only for after-hook annotation and is deleted after `tool.execute.after`; `lastRewrite` is **not** cleared then, so `/hypa` still shows the last successful rewrite.

### Ask handling

- **Interactive Ask:** out of scope for v1. No OpenCode server API pauses `tool.execute.before` for a UI confirm (research #3). Reopening trigger: a future OpenCode release adds (a) a server-plugin API that returns a Promise the host suspends pending UI input, or (b) a `ToolContext.ask`-equivalent accessible from server plugins.
- **Non-interactive Ask:** must-match, already shipped.
  - `askNonInteractive: "allow"` — silently apply the rewrite; `tool.execute.after`'s existing annotation marks the tool result so the LLM sees it. No extra user-facing surface. Matches Pi.
  - `askNonInteractive: "deny"` — throw an error containing the Ask reason and a hint to set `OPENCODE_HYPA_ASK_NON_INTERACTIVE=allow`. The error surfaces in the tool result the LLM sees, so the LLM knows why the call was blocked.

### Engineering bar

- **Tests:**
  - Unit: `policy.ts` (loadConfig with sources, parseRewriteJson, mapRewriteResult, isBashTool, isHypaCommand), `rewrite.ts` (rewriteCommand incl. AbortSignal abort path), `annotate.ts`, `resolve.ts`.
  - Integration (hook boundary): the server plugin entry exercised end-to-end with a fake `hypa` binary — assert command rewritten, tool result annotated, state module written, AbortSignal plumbed.
  - TUI: `formatHypaDiagnostics(state): string` (or structured rows) tested as a pure function. The TUI plugin entry itself (registering the command, opening the dialog) is thin glue and not unit-tested.
- **Node matrix:** minimum 18, CI on 22.
- **Release:** semver; `CHANGELOG.md` in keep-a-changelog format; publish via the existing GitHub Trusted Publisher OIDC workflow (`.github/workflows/publish.yml`).

## Testing Decisions

### What makes a good test

Test external behavior, not implementation details. The plugin is a thin adapter around Hypa and OpenCode; tests assert the contract between the plugin and its hosts, not the plugin's internals.

- **Pure functions** (`policy`, `rewrite`, `annotate`, `resolve`) are tested directly with inputs and expected outputs.
- **The server plugin entry** is tested at the hook boundary: invoke the returned `tool.execute.before` / `tool.execute.after` with shaped input/output objects and assert the observable effects on those objects (command changed, annotation prepended, metadata written) plus side effects on the state module.
- **The TUI formatter** is tested as a pure function: given a state snapshot, assert the rendered string/rows. The `api.ui.DialogAlert` call itself is not asserted.

### Seams

The plugin has **two architectural seams**:

1. **Server plugin entry** (integration). `test/plugin-hook-integration.test.ts` invokes `server(input, options)`, then drives `tool.execute.before` and `tool.execute.after` with a fake `hypa` binary. Covers: options loading, rewrite path, fail-open, AbortSignal plumbing, annotation, state-bridge write. This is the single highest-value seam.
2. **TUI diagnostics formatter** (pure unit). `formatHypaDiagnostics(state) → string`. Covers the operator-visibility contract without depending on the TUI runtime.

Pure-function unit tests under #1 are kept but aren't additional architectural seams — they're local tests of local functions.

### Prior art in the codebase

- `test/rewrite.test.ts` — already tests `rewriteCommand` with real `loadConfig({})`; extended for AbortSignal.
- `test/policy.test.ts` — already tests pure parsers; extended for source metadata.
- `test/annotate.test.ts` — already tests `annotateRewrite`; unchanged.
- `test/plugin-entry.test.ts` — split server/tui export shape (`exports["./server"]` / `exports["./tui"]`) and built `dist/` entries (requires `npm run build` first).
- `test/plugin-hook-integration.test.ts` — server hook boundary integration (`tool.execute.before` + `tool.execute.after`).

## Out of Scope

- **`hypa_*` CLI-backed tools** (`hypa_shell`, `hypa_read`, etc.) — Pi's additive tool modes. Not part of the rewrite hardwire.
- **Pi replace mode** — not how OpenCode's `tool.execute.before` works.
- **Hypa MCP proxy bridge** — `hypa serve` works as an MCP server; not integrated here.
- **First-party Hypa upstream adoption** — `hypa init --agent opencode`, upstream docs listing, ownership transfer. Separate effort.
- **Postinstall `hypa` PATH shim** — supply-chain red flag in 2026; CLI distribution is `@hypabolic/hypa`'s job, not the plugin's. Removed from the map, not deferred.
- **Interactive Ask confirmation** — no OpenCode server API to pause `tool.execute.before` for a UI confirm. Out of scope for v1; reopening gated on a future OpenCode release.
- **UI surfacing of rewrite metadata** (footers, toasts in the OpenCode UI outside `/hypa`) — folded into #7's TUI bridge, not a standalone v1 item.
- **Configurable diagnostics command name** — `/hypa` hardcoded for v1.
- **Default keybind for `/hypa`** — slash-only in v1.
- **Multi-rewrite history in `/hypa`** — last rewrite only.
- **Sidecar config file** under `~/.config/opencode/` — OpenCode-native `PluginOptions` + env only.

## Further Notes

### Map history

- Wayfinder map: #1.
- Research (closed): #2 (diagnostics command API), #3 (Ask confirmation path), #4 (Pi hardwire delta inventory), #5 (peer plugin options conventions).
- Grilling (closed): #6 (plugin options schema), #7 (diagnostics command contents), #8 (must-match vs nice-to-have deltas), #9 (spec artifact shape), #11 (Ask confirmation UX).

### Settled at implement time

1. **AbortSignal population** — OpenCode's `tool.execute.before` input type does not currently include `signal`. The rewrite path still threads `input.signal` when it is an `AbortSignal` (defensive; no-op until the host populates it). Covered by unit and hook-integration tests.
2. **TUI ↔ server state** — the TUI imports `src/state.ts` directly. No TUI-local fallback was added.
3. **`api.keymap.registerLayer`** — shipped as the `/hypa` registration API (`commands` / `bindings` / `slashName`).

### Glossary

Terms in their OpenCode / Hypa sense:

- **Hardwire** — intercept a host's tool call and rewrite it through Hypa before execution, without requiring the model to choose Hypa tools.
- **Rewrite** — `hypa rewrite --json <cmd>`; returns `{ input, outcome, command }`.
- **Outcome** — one of `Rewritten`, `GenericWrapper`, `Passthrough`, `Deny`, `Ask`.
- **Fail-open** — on any rewrite error or timeout, run the original command unchanged.
- **Ask** — Hypa flagged the command for confirmation; the plugin's policy decides allow vs deny non-interactively.
- **PluginOptions** — the second element of OpenCode's `plugin` tuple `[name, options]`; a plain object of camelCase keys.
- **State bridge** — the in-process singleton the server plugin writes and the TUI plugin reads.