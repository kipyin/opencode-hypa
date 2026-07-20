# opencode-hypa

**Hardwire [Hypa](https://github.com/Hypabolic/Hypa) into [OpenCode](https://opencode.ai) — no MCP required.**

[![npm](https://img.shields.io/npm/v/opencode-hypa?color=cb3837&logo=npm)](https://www.npmjs.com/package/opencode-hypa)
[![CI](https://github.com/kipyin/opencode-hypa/actions/workflows/ci.yml/badge.svg)](https://github.com/kipyin/opencode-hypa/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

OpenCode plugin that intercepts `bash` / `shell` tool calls and rewrites them through `hypa rewrite --json` before execution. Noisy command output is compressed locally and deterministically — the same hardwire pattern Hypa uses for Claude, Codex, and Pi.

```text
OpenCode bash tool call
        ↓
  opencode-hypa plugin
        ↓
   hypa rewrite --json
        ↓
hypa git … / hypa -c "…"
        ↓
errors · warnings · failing tests · exit codes
```

## Install

```bash
opencode plugin opencode-hypa --global
```

Or add to `~/.config/opencode/opencode.json` / `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-hypa"]
}
```

### Requirements

- [OpenCode](https://opencode.ai) with plugin support
- Node.js 18+ (or Bun) for the plugin runtime
- Hypa available via PATH, or installed as this package’s dependency (`@hypabolic/hypa`)

## What it does

| Hypa outcome | Plugin behavior |
|---|---|
| `Rewritten` / `GenericWrapper` | Replaces the bash command with Hypa’s rewritten form |
| `Passthrough` | Leaves the original command alone |
| `Deny` | Blocks the tool call |
| `Ask` | Blocks by default; set `OPENCODE_HYPA_ASK_NON_INTERACTIVE=allow` to proceed |
| Rewrite error / timeout | **Fails open** — runs the original command |

Commands that already start with `hypa` are never double-wrapped.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `OPENCODE_HYPA_ENABLED` | `true` | Set `0`/`false` to disable the plugin |
| `HYPA_BIN` | `hypa` (PATH / bundled) | Hypa executable or absolute path |
| `OPENCODE_HYPA_REWRITE_TIMEOUT_MS` | `5000` | Timeout for `hypa rewrite --json` |
| `OPENCODE_HYPA_ASK_NON_INTERACTIVE` | `deny` | `allow` or `deny` when Hypa returns `Ask` |

## Why not MCP?

`hypa serve` works as an MCP server, but the model has to choose those tools. This plugin rewrites every bash call automatically — the integration that actually saves context.

## Development

```bash
npm install
npm test
npm run build
```

## Related

- [Hypa](https://github.com/Hypabolic/Hypa) — local context runtime
- [`@hypabolic/pi-hypa`](https://www.npmjs.com/package/@hypabolic/pi-hypa) — official Hypa extension for Pi
- [OpenCode plugins](https://opencode.ai/docs/plugins/)

## License

MIT
