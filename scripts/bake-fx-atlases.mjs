// Bakes the effect sources in packages/fx-assets/effects into committed sprite
// atlases, and regenerates the typed manifest the display and the console read.
//
// The Arcadia Effects editor (tools/arcadia-effects, a submodule) is the render
// engine. Its simulation is deterministic - fixed 1/120 step, seeded RNG - so the
// same JSON always yields the same pixels, and a re-bake that changes nothing
// leaves the PNG alone. Two things keep this decoupled from the editor's own UI:
//
//   * the effect is handed in as an object through `AFX.Model.loadEffectFile`,
//     so nothing is copied into the submodule's own library/ folder, and
//   * we serve the editor's static files ourselves instead of starting its
//     `server.mjs`, which hardcodes port 5179 - that sits inside Vite's
//     auto-increment range, and `pnpm dev` on this machine had already taken it.
//     Our port lives in the harness block like every other one under scripts/.
//
// Usage:
//   node scripts/bake-fx-atlases.mjs
//   node scripts/bake-fx-atlases.mjs --only plasma-exhaust
//   node scripts/bake-fx-atlases.mjs --headed
import { createReadStream } from "node:fs";
import { readFile, readdir, rename, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { basename, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { chromium } from "@playwright/test";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const EDITOR_DIRECTORY = join(REPO_ROOT, "tools", "arcadia-effects", "Arcada Effects");
const PACKAGE_DIRECTORY = join(REPO_ROOT, "packages", "fx-assets");
const DEFAULT_PORT = 35_179;
const MIME = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

const { values } = parseArgs({
  options: {
    effects: { type: "string" },
    out: { type: "string" },
    only: { type: "string" },
    port: { type: "string", default: String(DEFAULT_PORT) },
    headed: { type: "boolean", default: false }
  }
});

const effectsDirectory = resolve(values.effects ?? join(PACKAGE_DIRECTORY, "effects"));
const outputDirectory = resolve(values.out ?? join(PACKAGE_DIRECTORY, "atlases"));
const port = Number(values.port);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new RangeError(`--port must be a TCP port, got ${values.port}`);
}
const only = (values.only ?? "")
  .split(",")
  .map((entry) => entry.trim())
  .filter((entry) => entry.length > 0);

const log = (event, fields) => {
  console.log(JSON.stringify({ event, ...fields }));
};

let server;
let browser;
let failed = false;

try {
  const catalogue = JSON.parse(await readFile(join(effectsDirectory, "catalogue.json"), "utf8"));
  const ids = (await readdir(effectsDirectory))
    .filter((entry) => entry.endsWith(".json") && entry !== "catalogue.json")
    .map((entry) => basename(entry, ".json"))
    .filter((id) => only.length === 0 || only.includes(id))
    .sort();
  if (ids.length === 0) throw new Error(`No effect sources matched in ${effectsDirectory}`);
  for (const id of ids) {
    if (catalogue[id] === undefined) {
      throw new Error(`${id}.json has no entry in effects/catalogue.json`);
    }
  }

  server = await serveEditor(port);
  const origin = `http://127.0.0.1:${String(port)}`;
  log("editor", { origin, root: EDITOR_DIRECTORY });

  // `channel: "chrome"` is the house convention (playwright.config.ts): this repo
  // drives the system Chrome and downloads no Playwright browser at all.
  browser = await chromium.launch({ channel: "chrome", headless: !values.headed });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error.message)));
  // `fresh=1` throws away any working copy the editor kept in localStorage; a
  // dirty copy otherwise wins over the file we are about to hand it.
  await page.goto(`${origin}/?fresh=1`, { waitUntil: "load" });
  try {
    await page.waitForFunction(
      () =>
        typeof globalThis.AFX?.Atlas?.build === "function" &&
        typeof globalThis.AFX?.Model?.loadEffectFile === "function"
    );
  } catch (error) {
    const reason = pageErrors[0] ?? String(error instanceof Error ? error.message : error);
    throw new Error(`Editor never came up on ${origin}. ${reason}`);
  }

  const baked = [];
  for (const id of ids) {
    const source = JSON.parse(await readFile(join(effectsDirectory, `${id}.json`), "utf8"));
    const built = await page.evaluate(bakeInPage, source);
    const emptyFrames = built.frameInk
      .map((ink, index) => ({ ink, index }))
      .filter((frame) => frame.ink === 0)
      .map((frame) => frame.index);
    if (emptyFrames.length > 0) {
      // A blank atlas is a valid PNG, so nothing downstream would notice. This
      // is the only place that can tell an effect rendered nothing.
      const total = String(built.frameInk.length);
      throw new Error(
        `${id}: frames ${emptyFrames.join(", ")} of ${total} are empty - the effect rendered nothing there`
      );
    }

    const bytes = Buffer.from(built.png.slice("data:image/png;base64,".length), "base64");
    await writeAtomic(join(outputDirectory, `${id}.png`), bytes);
    await writeAtomic(
      join(outputDirectory, `${id}.meta.json`),
      `${JSON.stringify(built.info, null, 2)}\n`
    );
    baked.push({ id, ...catalogue[id], meta: built.info, bytes: bytes.byteLength });
    log("effect", {
      id,
      frames: built.info.frames,
      frame: `${String(built.info.frameWidth)}x${String(built.info.frameHeight)}`,
      fps: built.info.fps,
      kib: Math.round(bytes.byteLength / 102.4) / 10,
      minInk: Math.min(...built.frameInk),
      maxInk: Math.max(...built.frameInk)
    });
  }

  // A partial run must not publish a partial manifest.
  if (only.length === 0) {
    await writeAtomic(join(PACKAGE_DIRECTORY, "src", "manifest.ts"), renderManifest(baked));
  }
  log("done", { effects: baked.length, manifest: only.length === 0 });
} catch (error) {
  failed = true;
  console.error(String(error instanceof Error ? error.message : error));
} finally {
  await browser?.close().catch(() => undefined);
  await new Promise((done) => {
    if (server === undefined) done(undefined);
    else server.close(() => done(undefined));
  });
  if (failed) process.exitCode = 1;
}

/**
 * Runs inside the editor page. Loads the effect, builds the atlas, and measures
 * every cell so the caller can tell an empty frame from a drawn one. One
 * function, because `page.evaluate` serialises it into the page.
 */
function bakeInPage(file) {
  const AFX = globalThis.AFX;
  const fail = (error) => new Error(String(error && error.message ? error.message : error));
  return new Promise((done, reject) => {
    try {
      AFX.Model.loadEffectFile(file, (doc) => {
        try {
          // The editor's own devsnap tool installs the doc the same way, and the
          // editor's caches key off the current document.
          AFX.state.doc = doc;
          AFX.touchAll();
          const { canvas, info } = AFX.Atlas.build(doc);
          const context = canvas.getContext("2d", { willReadFrequently: true });
          // On a transparent export alpha is the signal; the black and mask modes
          // paint every pixel opaque, so there brightness is.
          const opaqueBackground = info.mode === "black" || info.mode === "mask";
          const frameInk = [];
          for (let index = 0; index < info.frames; index += 1) {
            const x = (index % info.cols) * info.frameWidth;
            const y = Math.floor(index / info.cols) * info.frameHeight;
            const { data } = context.getImageData(x, y, info.frameWidth, info.frameHeight);
            let ink = 0;
            for (let offset = 0; offset < data.length; offset += 4) {
              const value = opaqueBackground
                ? Math.max(data[offset], data[offset + 1], data[offset + 2])
                : data[offset + 3];
              if (value > ink) ink = value;
            }
            frameInk.push(ink);
          }
          done({ png: canvas.toDataURL("image/png"), info, frameInk });
        } catch (error) {
          reject(fail(error));
        }
      });
    } catch (error) {
      reject(fail(error));
    }
  });
}

/** Read-only static server over the editor folder. No API: the bake needs none. */
function serveEditor(listenPort) {
  const root = resolve(EDITOR_DIRECTORY);
  const handler = createServer((request, response) => {
    const requested = decodeURIComponent(new URL(request.url ?? "/", "http://x").pathname);
    const target = resolve(join(root, requested === "/" ? "/index.html" : requested));
    if (target !== root && !target.startsWith(root + sep)) {
      response.writeHead(403).end();
      return;
    }
    const stream = createReadStream(target);
    stream.once("error", () => {
      response.writeHead(404).end();
    });
    stream.once("open", () => {
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": MIME[extname(target).toLowerCase()] ?? "application/octet-stream"
      });
      stream.pipe(response);
    });
  });
  return new Promise((done, reject) => {
    handler.once("error", (error) => {
      reject(
        error.code === "EADDRINUSE"
          ? new Error(`Port ${String(listenPort)} is busy; pass --port to move the bake.`)
          : error
      );
    });
    handler.listen(listenPort, "127.0.0.1", () => done(handler));
  });
}

function renderManifest(baked) {
  const entry = (effect) =>
    [
      "  {",
      `    id: ${JSON.stringify(effect.id)},`,
      `    title: ${JSON.stringify(effect.title)},`,
      `    category: ${JSON.stringify(effect.category)},`,
      `    hint: ${JSON.stringify(effect.hint)},`,
      `    oriented: ${JSON.stringify(effect.oriented === true)},`,
      `    loop: ${JSON.stringify(effect.loop === true)},`,
      `    bytes: ${String(effect.bytes)},`,
      // A literal is required: this is the form Vite rewrites into a hashed asset
      // URL in whichever app imports the manifest.
      `    url: new URL("../atlases/${effect.id}.png", import.meta.url).href,`,
      "    meta: {",
      `      frameWidth: ${String(effect.meta.frameWidth)},`,
      `      frameHeight: ${String(effect.meta.frameHeight)},`,
      `      cols: ${String(effect.meta.cols)},`,
      `      rows: ${String(effect.meta.rows)},`,
      `      frames: ${String(effect.meta.frames)},`,
      `      fps: ${String(effect.meta.fps)},`,
      `      duration: ${String(effect.meta.duration)}`,
      "    }",
      "  }"
    ].join("\n");
  return [
    "// Generated by `pnpm fx:bake`. Do not edit by hand - edit the sources in",
    "// `effects/` and re-bake, or the next bake overwrites you.",
    'import type { FxEffect } from "./types.ts";',
    "",
    "export const FX_EFFECTS: readonly FxEffect[] = [",
    baked.map(entry).join(",\n"),
    "];",
    ""
  ].join("\n");
}

async function writeAtomic(path, contents) {
  const temporary = `${path}.tmp`;
  await writeFile(temporary, contents);
  await rename(temporary, path);
}
