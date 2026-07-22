# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-07-22

### Added

- OpenCode server plugin that rewrites `bash` / `shell` tool calls through `hypa rewrite --json`.
- OpenCode-native configuration via `PluginOptions` and `OPENCODE_HYPA_*` environment variables.
- `/hypa` TUI diagnostics command showing resolved binary, Hypa version, effective config, and last rewrite.
- Tool-result annotation when Hypa rewrites a command so the LLM sees the original input.
- Fail-open behavior on rewrite errors and timeouts; deny/ask policies for Hypa outcomes.

[Unreleased]: https://github.com/kipyin/opencode-hypa/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/kipyin/opencode-hypa/releases/tag/v1.0.0
