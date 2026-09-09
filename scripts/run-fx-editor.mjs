/**
 * The effects editor, pointed at our own sources instead of its library.
 *
 * The submodule ships its own server, and `pnpm fx:editor` runs it - but it can
 * only ever open the files in its own `library/`, because both the folder and
 * the port are constants in its source (`server.mjs`), and we do not edit the
 * submodule. So hand-tuning an effect of ours meant copying the file in, tuning,
 * copying it back and remembering to run prettier over it.
 *
 * This serves the same editor UI over the same API, with two differences that
 * matter: the library is `packages/fx-assets/effects`, so Save writes the real
 * source; and the port is in the harness block, so it can run while `pnpm dev`
 * has the app on 5173-5175 - the editor's own 5179 is exactly where Vite's
 * fourth app lands.
 *
 * Usage:
 *   pnpm fx:edit                 # editor on 35179, bakes each save
 *   pnpm fx:edit --no-bake       # save only, bake by hand later
 *   pnpm fx:edit --port=35180
 *
 * The game reads the baked atlas, never the source, so a save is not visible in
 * a running display until the atlas is rebuilt. Each save therefore triggers
 * `bake --only <id>` (some seconds), after which a refresh of the display tab
 * shows the change - Phaser holds the texture it loaded, so a refresh is needed
 * rather than just HMR. `--only` deliberately leaves `src/manifest.ts` alone
 * (see the note in the bake script), so its recorded byte sizes go stale: run a
 * full `pnpm fx:bake` before committing, which the on-disk test also checks.
 */

import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPOSITORY = resolve(HERE, "..");
const EDITOR_ROOT = join(REPOSITORY, "tools", "arcadia-effects", "Arcada Effects");
const EFFECTS = join(REPOSITORY, "packages", "fx-assets", "effects");
const SNAPSHOTS = join(REPOSITORY, "node_modules", ".cache", "fx-editor-snaps");

/** Ours, not the editor's: `catalogue.json` is our metadata, not an effect. */
const NOT_AN_EFFECT = new Set(["catalogue.json"]);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

const { values } = parseArgs({
  options: {
    port: { type: "string", default: "35179" },
    "no-bake": { type: "boolean", default: false }
  }
});
const port = Number(values.port);
const bakeOnSave = !values["no-bake"];

function log(event, extra = {}) {
  process.stdout.write(`${JSON.stringify({ event, ...extra })}\n`);
}

function json(response, code, body) {
  response.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function readBody(request) {
  return new Promise((ok, fail) => {
    let data = "";
    request.on("data", (chunk) => {
      data += chunk;
      // The editor posts whole documents, textures inlined as data URLs.
      if (data.length > 80 * 1024 * 1024) {
        fail(new Error("body too large"));
        request.destroy();
      }
    });
    request.on("end", () => ok(data));
    request.on("error", fail);
  });
}

/** A source of ours by file name, with no way out of the folder. */
function effectPath(file) {
  const base = String(file ?? "").replace(/^.*[\\/]/u, "");
  if (!/^[A-Za-z0-9._-]+\.json$/u.test(base) || NOT_AN_EFFECT.has(base)) return undefined;
  return join(EFFECTS, base);
}

async function listEffects() {
  const files = (await readdir(EFFECTS)).filter(
    (file) => file.endsWith(".json") && !NOT_AN_EFFECT.has(file)
  );
  const items = [];
  for (const file of files) {
    const path = join(EFFECTS, file);
    let name = file.replace(/\.json$/iu, "");
    let id;
    try {
      const data = JSON.parse(await readFile(path, "utf8"));
      if (typeof data.doc?.name === "string") name = data.doc.name;
      if (typeof data.doc?.id === "string") id = data.doc.id;
    } catch {
      // A half-written file is still worth listing by its name.
    }
    // No `thumb`: our sources do not carry one, and the editor is happy without.
    items.push({ file, name, id: id ?? null, thumb: null, mtime: (await stat(path)).mtimeMs });
  }
  return items.sort((a, b) => b.mtime - a.mtime);
}

/**
 * Which of our files a save belongs to.
 *
 * The editor names the file after the effect, so a straight port of its Save
 * would write `Shield Band.json` beside `shield-band.json` and the bake would
 * carry on using the old one. The document's own `doc.id` is the stable link -
 * the skill requires it to be set and never to change - so the save lands back
 * on the file it was opened from.
 */
async function targetFor(payload) {
  const id = payload?.doc?.id;
  if (typeof id === "string" && id.length > 0) {
    for (const item of await listEffects()) if (item.id === id) return item.file;
  }
  const name = String(payload?.doc?.name ?? "effect")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return `${name.length > 0 ? name : "effect"}.json`;
}

function run(command, args) {
  return new Promise((ok) => {
    const child = spawn(command, args, {
      cwd: REPOSITORY,
      shell: process.platform === "win32",
      stdio: "inherit"
    });
    child.on("exit", (code) => ok(code ?? 1));
  });
}

/** Prettier first, or `format:check` fails the gate on the next run. */
async function formatAndBake(file) {
  const relative = `packages/fx-assets/effects/${file}`;
  const formatted = await run("pnpm", ["exec", "prettier", "--write", relative]);
  log("formatted", { file, exit: formatted });
  if (!bakeOnSave) return;
  const id = file.replace(/\.json$/iu, "");
  log("baking", { id });
  const baked = await run("node", ["scripts/bake-fx-atlases.mjs", `--only=${id}`]);
  log("baked", { id, exit: baked, hint: "обнови вкладку дисплея" });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://editor");
  const route = decodeURIComponent(url.pathname);
  try {
    if (route === "/api/list") {
      return json(response, 200, await listEffects());
    }
    if (route === "/api/effect") {
      const path = effectPath(url.searchParams.get("f"));
      if (path === undefined) return json(response, 404, { error: "not found" });
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      return response.end(await readFile(path));
    }
    if (route === "/api/save" && request.method === "POST") {
      const body = JSON.parse(await readBody(request));
      const payload = body.data ?? {};
      // The thumbnail is a base64 image the editor keeps for its own list. Our
      // sources are read by people and by the bake, so it stays out of them.
      const file = await targetFor(payload);
      const path = effectPath(file);
      if (path === undefined) return json(response, 400, { error: "bad name" });
      await writeFile(path, `${JSON.stringify(payload, undefined, 2)}\n`, "utf8");
      log("saved", { file });
      void formatAndBake(file);
      return json(response, 200, { ok: true, file });
    }
    if (route === "/api/snap" && request.method === "POST") {
      const body = JSON.parse(await readBody(request));
      const match = /^data:image\/(png|jpeg);base64,/u.exec(String(body.data ?? ""));
      if (match === null) return json(response, 400, { error: "expected png/jpeg dataURL" });
      await mkdir(SNAPSHOTS, { recursive: true });
      const name = String(body.name ?? "snap").replace(/[^A-Za-z0-9._-]+/gu, "_");
      const file = join(SNAPSHOTS, `${name.replace(/\.(png|jpe?g)$/iu, "")}.png`);
      await writeFile(file, Buffer.from(String(body.data).slice(match[0].length), "base64"));
      return json(response, 200, { ok: true, file });
    }
    if (route === "/api/delete") {
      // Our effects are tracked files named by the protocol; a dev tool does not
      // get to remove one behind the repository's back.
      return json(response, 403, { error: "delete an effect through git, not here" });
    }

    const path = join(EDITOR_ROOT, route === "/" ? "index.html" : route);
    if (!path.startsWith(EDITOR_ROOT)) return json(response, 403, { error: "forbidden" });
    const info = await stat(path).catch(() => undefined);
    if (info === undefined || !info.isFile()) return json(response, 404, { error: "not found" });
    response.writeHead(200, {
      "Content-Type": MIME[extname(path).toLowerCase()] ?? "application/octet-stream",
      "Cache-Control": "no-store"
    });
    return createReadStream(path).pipe(response);
  } catch (error) {
    return json(response, 500, { error: String(error instanceof Error ? error.message : error) });
  }
});

server.listen(port, () => {
  log("editor", {
    url: `http://localhost:${String(port)}/`,
    library: EFFECTS,
    bakeOnSave
  });
});
