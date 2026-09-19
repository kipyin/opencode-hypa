# AGENTS.md

## Cursor Cloud specific instructions

`opencode-hypa` is a single npm package (an OpenCode plugin) — there is no server, database, or GUI. It rewrites bash/shell tool calls through the `hypa` CLI.

OpenCode rejects a combined `{ server, tui }` module. The package ships split entries:

- `exports["./server"]` → `dist/index.js` (server-only `PluginModule`)
- `exports["./tui"]` → `dist/tui.js` (TUI-only module)

- Node 22 is used (matches `.github/workflows/ci.yml`). Dependencies install with `npm ci` (run automatically by the startup update script).
- Standard commands live in `package.json` scripts: `npm run typecheck`, `npm test`, `npm run build`, `npm run smoke:hooks`, `npm run smoke:opencode`. There is no lint script.
- `npm test` runs `tsx --test test/*.test.ts`. Some tests spawn the real `hypa` binary (bundled via the `@hypabolic/hypa` dependency, available at `node_modules/.bin/hypa`), so tests exercise actual rewrites, not mocks.
- `test/plugin-entry.test.ts` asserts built `dist/index.js` and `dist/tui.js` exist. Run `npm run build` before that dist-entry check (CI runs `build` then `test`; a local `npm test` without a prior build fails the built-package cases).
- `npm run smoke:hooks` loads the built `exports["./server"]` / `exports["./tui"]` entries and drives `tool.execute.before` / `tool.execute.after` (a `git status` command is rewritten to `hypa git status`). `npm run smoke:opencode` packs the plugin and loads it through a real `opencode serve`. Both smokes require `npm run build` first.
