# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Ask-allow no longer records or annotates Hypa `Ask` as `GenericWrapper`. Last rewrite and `[hypa Ask]` now keep the real outcome.
- Keep `/hypa` last rewrite after `tool.execute.after` so the diagnostics modal still shows the last successful rewrite.

### Added

- CI `opencode-latest` job (push/PR + weekly cron) installs npm `@opencode-ai/plugin@latest` and re-runs typecheck, tests, and a rewrite/hook smoke against current OpenCode.
- Loader smoke now also creates a session and drives `POST /session/:id/shell` (plus a dummy-model bash-tool fallback) so CI notices if OpenCode loads the plugin but stops dispatching `tool.execute.before` on a real shell path.

### Removed

- Server entry no longer re-exports `HypaConfig`, `HypaConfigWithSources`, or `RewriteStatus`. `PluginOptions` stays the public options type.
- Dead leftovers after `formatHypaDiagnostics` and the JSX-free TUI: unused `formatStatus`, `scripts/probe-tui-load.mjs`, and the duplicate `fake-hypa-rewrite.js` fixture.
- Direct `@opentui/core`, `@opentui/keymap`, and `@opentui/solid` devDependencies. This package never imports them; they remain optional peers of `@opencode-ai/plugin`. CI `opencode-latest` now installs only `@opencode-ai/plugin@latest`.

## [1.0.3] - 2026-07-22

### Fixed

- Ship a JSX-free `exports["./tui"]` as `dist/tui.js`. OpenCode's Bun JSX transform skips `node_modules`, so the previous `dist/tui.jsx` failed to import (`@opentui/solid/jsx-dev-runtime`) and `/hypa` never registered.

## [1.0.2] - 2026-07-22

### Fixed

- Add `/** @jsxImportSource @opentui/solid */` to the TUI entry so preserved JSX resolves under OpenCode/Bun.

## [1.0.1] - 2026-07-22

### Fixed

- Split server and TUI into separate package entrypoints (`exports["./server"]`, `exports["./tui"]`) so OpenCode's TUI loader can register `/hypa`. A combined `{ server, tui }` module is rejected by OpenCode, and the previous build imported a non-existent `tui.js` while emitting `tui.jsx`.

## [1.0.0] - 2026-07-22

### Added

- OpenCode server plugin that rewrites `bash` / `shell` tool calls through `hypa rewrite --json`.
- OpenCode-native configuration via `PluginOptions` and `OPENCODE_HYPA_*` environment variables.
- `/hypa` TUI diagnostics command showing resolved binary, Hypa version, effective config, and last rewrite.
- Tool-result annotation when Hypa rewrites a command so the LLM sees the original input.
- Fail-open behavior on rewrite errors and timeouts; deny/ask policies for Hypa outcomes.

[Unreleased]: https://github.com/kipyin/opencode-hypa/compare/v1.0.3...HEAD
[1.0.3]: https://github.com/kipyin/opencode-hypa/releases/tag/v1.0.3
[1.0.2]: https://github.com/kipyin/opencode-hypa/releases/tag/v1.0.2
[1.0.1]: https://github.com/kipyin/opencode-hypa/releases/tag/v1.0.1
[1.0.0]: https://github.com/kipyin/opencode-hypa/releases/tag/v1.0.0
