# AGENTS.md

## Cursor Cloud specific instructions

`opencode-hypa` is a single npm package (an OpenCode plugin) — there is no server, database, or GUI. It rewrites bash/shell tool calls through the `hypa` CLI.

- Node 22 is used (matches `.github/workflows/ci.yml`). Dependencies install with `npm ci` (run automatically by the startup update script).
- Standard commands live in `package.json` scripts: `npm run typecheck`, `npm test`, `npm run build`. There is no lint script.
- `npm test` runs `tsx --test test/*.test.ts`. Some tests spawn the real `hypa` binary (bundled via the `@hypabolic/hypa` dependency, available at `node_modules/.bin/hypa`), so tests exercise actual rewrites, not mocks.
- To exercise the plugin end-to-end, `npm run build` then load `dist/index.js`, call `plugin.server({}, undefined)`, and invoke the returned `tool.execute.before` / `tool.execute.after` hooks with a fake `{ tool: "bash" }` input. A `git status` command gets rewritten to `hypa git status`.
