/**
 * Post-release check against a live public deployment.
 *
 * `network-smoke.mjs` next door proves the wire and starts its own server to do
 * it. This one proves the *deployment*: that the reverse proxy carries the
 * WebSocket upgrade, that the public hull catalogue is readable from another
 * origin, and that both browser apps are actually served. It starts nothing,
 * changes no balance, and plays no wave -- it creates one room, seats one
 * controller, and leaves with consent so the room disposes immediately.
 *
 * A green run here and a red game means the fault is in the app, not the
 * plumbing; a red run here names which piece of plumbing.
 *
 * Usage:
 *   node apps/controller/scripts/production-smoke.mjs \
 *     --api wss://api.example.test \
 *     [--display https://display.example.test] \
 *     [--controller https://control.example.test]
 */
import { Client } from "@colyseus/sdk";
import {
  PROTOCOL_VERSION,
  ROOM_TYPE,
  clientMessage,
  publicShipCatalogueSchema,
  serverLatencyProbeSchema,
  serverMessage
} from "@spaceship-defender/protocol";

const options = readOptions(process.argv.slice(2));
const httpOrigin = toHttpOrigin(options.api);
const failures = [];
let display;
let controller;

try {
  await checkHealth();
  await checkShipCatalogue();
  await checkAdminIsClosed();
  await checkStaticSite("display", options.display);
  await checkStaticSite("controller", options.controller);
  await checkRoom();
  console.log("Production smoke passed.");
} catch (error) {
  failures.push(describe(error));
} finally {
  // Consented leaves, so the smoke does not leave a room holding a seat until
  // the lobby deadline expires.
  await Promise.allSettled([display?.leave(true), controller?.leave(true)]);
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`Production smoke failed: ${failure}`);
  process.exitCode = 1;
}

async function checkHealth() {
  const response = await fetchWithTimeout(`${httpOrigin}/health`);
  if (!response.ok) throw new Error(`/health answered ${String(response.status)}.`);
  const body = await response.json();
  if (body?.status !== "ok") throw new Error(`/health answered ${JSON.stringify(body)}.`);
  console.log("  health: ok");
}

async function checkShipCatalogue() {
  const response = await fetchWithTimeout(`${httpOrigin}/ships`);
  if (!response.ok) throw new Error(`/ships answered ${String(response.status)}.`);
  const parsed = publicShipCatalogueSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("/ships answered a payload of an unexpected shape.");
  // Without this header the browser drops the answer and the create screen
  // silently loses every hull name, which reads as an art bug rather than a
  // deployment one.
  const origin = response.headers.get("access-control-allow-origin");
  if (origin === null) throw new Error("/ships answered without a permissive origin header.");
  console.log(`  hull catalogue: ${String(parsed.data.ships.length)} hulls, origin ${origin}`);
}

/**
 * The game API and the balance console are one process on one port, so
 * publishing the API domain would publish the console with it, guarded by a
 * password alone. The reverse proxy is what closes that, and a proxy host
 * rebuilt without the rule looks exactly like a working one until someone
 * finds it -- so the release asks.
 *
 * 404 rather than 401 on purpose: from outside there should be nothing here to
 * try a password against. A local check against the API directly would answer
 * 401 and prove nothing, which is why this only runs against a public address.
 */
async function checkAdminIsClosed() {
  if (!/^wss:/u.test(options.api)) {
    console.log("  admin paths: skipped, the API address is not a public one");
    return;
  }
  for (const path of ["/admin/balance", "/stats/rooms.json"]) {
    const response = await fetchWithTimeout(`${httpOrigin}${path}`, 15_000, "manual");
    if (response.status !== 404)
      throw new Error(
        `${path} answered ${String(response.status)} on the public API address; the proxy should refuse it with 404.`
      );
  }
  console.log("  admin paths: closed on the public address");
}

async function checkStaticSite(name, url) {
  if (url === undefined) {
    console.log(`  ${name} site: skipped, no address given`);
    return;
  }
  const response = await fetchWithTimeout(url);
  if (!response.ok) throw new Error(`${name} site answered ${String(response.status)}.`);
  const body = await response.text();
  if (!body.includes('id="root"'))
    throw new Error(`${name} site answered a document without the application root.`);
  console.log(`  ${name} site: ok`);
}

/**
 * The one check that needs a WebSocket upgrade through the proxy. Matchmaking
 * answers over plain HTTP, so a proxy without the upgrade lets creation succeed
 * and then drops the connection -- which on screen looks like a room that
 * appears and vanishes.
 */
async function checkRoom() {
  display = await new Client(options.api).create(ROOM_TYPE, {
    role: "display",
    protocolVersion: PROTOCOL_VERSION,
    crewSize: 3
  });
  answerLatencyProbes(display);
  console.log(`  room created: ${display.roomId}`);
  controller = await new Client(options.api).joinById(display.roomId, {
    role: "controller",
    protocolVersion: PROTOCOL_VERSION,
    playerName: "Smoke"
  });
  answerLatencyProbes(controller);
  await waitFor(
    () => display.state.players.size === 1,
    "the display never saw the controller take a seat"
  );
  const seat = [...display.state.players.values()][0];
  if (seat?.role === undefined) throw new Error("The seated controller carries no role.");
  console.log(`  controller seated as ${seat.role}`);
}

/** A real client answers these; without it the room only ever reads -1 ms. */
function answerLatencyProbes(room) {
  room.onMessage(serverMessage.latencyProbe, (payload) => {
    const parsed = serverLatencyProbeSchema.safeParse(payload);
    if (!parsed.success) return;
    room.send(clientMessage.latencyPong, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      probeId: parsed.data.probeId
    });
  });
}

async function waitFor(predicate, what, timeoutMs = 10_000, intervalMs = 50) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out after ${String(timeoutMs)} ms: ${what}.`);
}

async function fetchWithTimeout(url, timeoutMs = 15_000, redirect = "follow") {
  return await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect });
}

/** Same rule the display uses for the catalogue: wss -> https, ws -> http. */
function toHttpOrigin(gameServerUrl) {
  return gameServerUrl.replace(/^ws/u, "http").replace(/\/+$/u, "");
}

function readOptions(argv) {
  const values = { api: undefined, display: undefined, controller: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--api" || flag === "--display" || flag === "--controller") {
      if (value === undefined) throw new Error(`${flag} needs a value.`);
      values[flag.slice(2)] = value;
      index += 1;
    }
  }
  values.api ??= process.env.PUBLIC_API_URL;
  values.display ??= process.env.PUBLIC_DISPLAY_URL;
  values.controller ??= process.env.PUBLIC_CONTROLLER_URL;
  if (values.api === undefined || values.api.length === 0)
    throw new Error("Pass --api wss://host or set PUBLIC_API_URL.");
  return values;
}

function describe(error) {
  return error instanceof Error ? error.message : String(error);
}
