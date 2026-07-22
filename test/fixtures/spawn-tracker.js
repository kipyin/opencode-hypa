import fs from "node:fs"

const marker = process.env.SPAWN_MARKER
if (marker) {
  fs.writeFileSync(marker, "spawned")
}

process.on("SIGTERM", () => process.exit(143))
setInterval(() => {}, 60_000)
