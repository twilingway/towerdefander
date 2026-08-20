import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { Client } from "@colyseus/sdk";

const port = 35_677;
const protocolVersion = 5;
const endpoint = `ws://127.0.0.1:${String(port)}`;
const healthEndpoint = `http://127.0.0.1:${String(port)}/health`;
const serverEntry = fileURLToPath(new URL("../../server/dist/index.js", import.meta.url));
const serverProcess = spawn(process.execPath, [serverEntry], {
  env: {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: String(port),
    RECONNECTION_GRACE_SECONDS: "0.25"
  },
  stdio: "ignore",
  windowsHide: true
});

let display;
let pilot;
let gunner;
let shield;
let replacement;

try {
  await waitForServer();
  display = await new Client(endpoint).create("town_defenders", {
    role: "display",
    protocolVersion
  });
  pilot = await joinController(display.roomId, "Pilot");
  gunner = await joinController(display.roomId, "Gunner");
  shield = await joinController(display.roomId, "Shield");
  await waitFor(() => display.state.players.size === 3);

  const roles = [...display.state.players.values()].map((player) => player.role);
  if (roles.join(",") !== "pilot,gunner,shield")
    throw new Error(`Unexpected roles: ${roles.join(",")}`);

  for (const controller of [pilot, gunner, shield]) {
    controller.send("controller:ready", envelope(display.roomId, controller.sessionId));
  }
  await waitFor(() => display.state.phase === "active" && display.state.hasGame === true);
  if (pilot.state.game.display !== undefined)
    throw new Error("Controller received display-only world collections.");

  const startX = display.state.game.castle.x;
  pilot.send("pilot:input", {
    ...envelope(display.roomId, pilot.sessionId),
    sequence: 1,
    vector: { x: 1, y: 0 }
  });
  await waitFor(() => display.state.game.castle.x > startX);

  gunner.send("gunner:input", {
    ...envelope(display.roomId, gunner.sessionId),
    sequence: 1,
    aim: { x: 0, y: -1 },
    firing: true
  });
  await waitFor(() => display.state.game.display.projectiles.length > 0);

  shield.send("shield:input", {
    ...envelope(display.roomId, shield.sessionId),
    sequence: 1,
    aim: { x: -1, y: 0 },
    active: true
  });
  await waitFor(() => display.state.game.shield.active === true);

  const roleError = nextServerError(shield);
  shield.send("pilot:input", {
    ...envelope(display.roomId, shield.sessionId),
    sequence: 2,
    vector: { x: -1, y: 0 }
  });
  if ((await roleError).code !== "role_mismatch")
    throw new Error("Wrong-role input was not rejected.");

  const pilotId = pilot.sessionId;
  const pilotToken = pilot.reconnectionToken;
  pilot.reconnection.enabled = false;
  pilot.connection.close();
  await waitFor(() => display.state.players.get(pilotId)?.connected === false);
  pilot = await new Client(endpoint).reconnect(pilotToken);
  await waitFor(() => display.state.players.get(pilotId)?.connected === true);
  const xBeforeReconnectInput = display.state.game.castle.x;
  pilot.send("pilot:input", {
    ...envelope(display.roomId, pilot.sessionId),
    sequence: 1,
    vector: { x: -1, y: 0 }
  });
  await waitFor(() => display.state.game.castle.x < xBeforeReconnectInput);

  const gunnerId = gunner.sessionId;
  gunner.reconnection.enabled = false;
  gunner.connection.close();
  await waitFor(() => !display.state.players.has(gunnerId), 80);
  gunner = undefined;
  replacement = await joinController(display.roomId, "Replacement");
  await waitFor(() => display.state.players.get(replacement.sessionId)?.role === "gunner");

  console.log(
    JSON.stringify({
      roomId: display.roomId,
      phase: display.state.phase,
      players: display.state.players.size,
      castleX: display.state.game.castle.x,
      projectiles: display.state.game.display.projectiles.length,
      shieldActive: display.state.game.shield.active,
      replacementRole: display.state.players.get(replacement.sessionId).role
    })
  );
} finally {
  await Promise.allSettled([
    pilot?.leave(),
    gunner?.leave(),
    shield?.leave(),
    replacement?.leave(),
    display?.leave()
  ]);
  serverProcess.kill();
}

function envelope(roomId, playerId) {
  return { protocolVersion, roomId, playerId };
}

async function joinController(roomId, playerName) {
  return new Client(endpoint).joinById(roomId, { role: "controller", protocolVersion, playerName });
}

async function waitForServer() {
  await waitFor(async () => {
    try {
      return (await fetch(healthEndpoint)).ok;
    } catch {
      return false;
    }
  });
}

async function waitFor(predicate, maximumAttempts = 60) {
  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Network smoke-test timed out.");
}

async function nextServerError(room) {
  return Promise.race([
    new Promise((resolve) => room.onMessage("server:error", resolve)),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Expected server:error.")), 1000))
  ]);
}
