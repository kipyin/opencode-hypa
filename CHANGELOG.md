# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/kipyin/opencode-hypa/compare/v1.0.2...HEAD
[1.0.2]: https://github.com/kipyin/opencode-hypa/releases/tag/v1.0.2
[1.0.1]: https://github.com/kipyin/opencode-hypa/releases/tag/v1.0.1
[1.0.0]: https://github.com/kipyin/opencode-hypa/releases/tag/v1.0.0
