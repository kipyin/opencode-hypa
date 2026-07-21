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

### Agent visibility

When Hypa rewrites a command, OpenCode would otherwise hand the LLM a tool result whose `title` shows the rewritten command (`hypa git log …`) with no marker that a plugin changed it. The LLM can misread the prefix as its own typo. To prevent that, this plugin also registers `tool.execute.after` and annotates the tool result with a one-line note:

```text
[hypa Rewritten] git log --oneline -10 => hypa git log --oneline -10
```

The note is prepended to both `output.title` and `output.output`, and the full record is written to `output.metadata.hypaRewrite`. Non-rewritten outcomes (passthrough / skipped / error) leave the tool result untouched.

## Configuration

Set options in `opencode.json` as the second element of the plugin tuple, or override any field with an environment variable (env wins over options).

```json
{
  "plugin": [
    "opencode-hypa",
    {
      "binary": "hypa",
      "rewriteTimeoutMs": 5000,
      "askNonInteractive": "deny",
      "enabled": true
    }
  ]
}
```

| Option (`PluginOptions`) | Env var | Default | Description |
|---|---|---|---|
| `binary` | `OPENCODE_HYPA_BIN` | `hypa` (PATH / bundled) | Hypa executable or absolute path |
| `rewriteTimeoutMs` | `OPENCODE_HYPA_REWRITE_TIMEOUT_MS` | `5000` | Timeout for `hypa rewrite --json` |
| `askNonInteractive` | `OPENCODE_HYPA_ASK_NON_INTERACTIVE` | `deny` | `allow` or `deny` when Hypa returns `Ask` |
| `enabled` | `OPENCODE_HYPA_ENABLED` | `true` | Set `false` / `0` to disable the plugin |

## Diagnostics

In the OpenCode TUI, run `/hypa` to open a modal with:

- whether the plugin is enabled
- resolved Hypa binary path and whether it exists
- installed Hypa version (`hypa --version`, cached at TUI load)
- effective config for each field with source tag (`env`, `options`, or `default`)
- the last rewrite (input, command, outcome, timestamp) or `none`

Re-open `/hypa` to refresh the snapshot after config or rewrite changes.

## Why not MCP?

`hypa serve` works as an MCP server, but the model has to choose those tools. This plugin rewrites every bash call automatically — the integration that actually saves context.

## Development

```bash
npm install
npm test
npm run build
```

## Publishing

Releases publish to npm via [Trusted Publishers](https://docs.npmjs.com/trusted-publishers) (GitHub OIDC). No long-lived npm token is stored in the repo.

1. On npm: [opencode-hypa → Settings → Trusted Publisher](https://www.npmjs.com/package/opencode-hypa/access)
2. Add GitHub with:

| Field | Value |
|---|---|
| Organization or user | `kipyin` |
| Repository | `opencode-hypa` |
| Workflow filename | `publish.yml` |
| Environment | *(leave empty)* |

3. Publish a GitHub Release (`vX.Y.Z`), or run the **publish** workflow manually.

## Related

- [Hypa](https://github.com/Hypabolic/Hypa) — local context runtime
- [`@hypabolic/pi-hypa`](https://www.npmjs.com/package/@hypabolic/pi-hypa) — official Hypa extension for Pi
- [OpenCode plugins](https://opencode.ai/docs/plugins/)

## License

MIT
