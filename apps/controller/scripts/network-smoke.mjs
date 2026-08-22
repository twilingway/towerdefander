import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { Client } from "@colyseus/sdk";
import {
  PROTOCOL_VERSION,
  clientMessage,
  serverLatencyProbeSchema,
  serverMessage
} from "@town-defenders/protocol";

const port = 35_677;
const protocolVersion = PROTOCOL_VERSION;
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
  attachLatencyResponder(display);
  pilot = await joinController(display.roomId, "Pilot");
  gunner = await joinController(display.roomId, "Gunner");
  shield = await joinController(display.roomId, "Shield");
  await waitFor(() => display.state.players.size === 3);
  await waitFor(
    () =>
      display.state.displayLatencyMs >= 0 &&
      [...display.state.players.values()].every((player) => player.latencyMs >= 0),
    120
  );

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
  await waitFor(() => display.state.game.turretAngle < 0);
  const traversingTurretAngle = display.state.game.turretAngle;
  if (!(traversingTurretAngle > -Math.PI / 2))
    throw new Error("Turret snapped to its target instead of traversing gradually.");
  await waitFor(() => display.state.game.display.friendlyProjectiles.size > 0);
  const firstProjectile = display.state.game.display.friendlyProjectiles.values().next().value;
  if (firstProjectile === undefined) throw new Error("Friendly projectile was not synchronized.");
  const projectileAngle = Math.atan2(firstProjectile.velocityY, firstProjectile.velocityX);
  if (!(projectileAngle < 0 && projectileAngle > -Math.PI / 2))
    throw new Error("Projectile did not use the current traversing turret angle.");

  shield.send("shield:input", {
    ...envelope(display.roomId, shield.sessionId),
    sequence: 1,
    aim: { x: -1, y: 0 },
    active: false
  });
  await waitFor(() => display.state.game.shield.angle > 0);
  if (display.state.game.shield.active || display.state.game.shield.energy !== 100)
    throw new Error("Inactive shield pre-aim changed active state or energy.");
  if (!(display.state.game.shield.angle < Math.PI))
    throw new Error("Shield snapped to its antipodal target instead of traversing positively.");
  shield.send("shield:input", {
    ...envelope(display.roomId, shield.sessionId),
    sequence: 2,
    aim: { x: -1, y: 0 },
    active: true
  });
  await waitFor(() => display.state.game.shield.active === true);
  await waitFor(() => display.state.game.shield.energy < display.state.game.shield.capacity);
  const drainedShieldEnergy = display.state.game.shield.energy;
  shield.send("shield:input", {
    ...envelope(display.roomId, shield.sessionId),
    sequence: 3,
    aim: { x: -1, y: 0 },
    active: false
  });
  await waitFor(() => display.state.game.shield.active === false);
  await waitFor(() => display.state.game.shield.energy > drainedShieldEnergy);

  const roleError = nextServerError(shield);
  shield.send("pilot:input", {
    ...envelope(display.roomId, shield.sessionId),
    sequence: 3,
    vector: { x: -1, y: 0 }
  });
  if ((await roleError).code !== "role_mismatch")
    throw new Error("Wrong-role input was not rejected.");

  const gunnerId = gunner.sessionId;
  const gunnerToken = gunner.reconnectionToken;
  gunner.reconnection.enabled = false;
  gunner.connection.close();
  await waitFor(() => display.state.players.get(gunnerId)?.connected === false);
  gunner = await new Client(endpoint).reconnect(gunnerToken);
  attachLatencyResponder(gunner);
  await waitFor(() => display.state.players.get(gunnerId)?.connected === true);
  const angleBeforeReconnectInput = display.state.game.turretAngle;
  gunner.send("gunner:input", {
    ...envelope(display.roomId, gunner.sessionId),
    sequence: 1,
    aim: { x: 0, y: 1 },
    firing: false
  });
  await waitFor(() => display.state.game.turretAngle > angleBeforeReconnectInput);

  const pilotId = pilot.sessionId;
  const pilotToken = pilot.reconnectionToken;
  pilot.reconnection.enabled = false;
  pilot.connection.close();
  await waitFor(() => display.state.players.get(pilotId)?.connected === false);
  pilot = await new Client(endpoint).reconnect(pilotToken);
  attachLatencyResponder(pilot);
  await waitFor(() => display.state.players.get(pilotId)?.connected === true);
  const xBeforeReconnectInput = display.state.game.castle.x;
  pilot.send("pilot:input", {
    ...envelope(display.roomId, pilot.sessionId),
    sequence: 1,
    vector: { x: -1, y: 0 }
  });
  await waitFor(() => display.state.game.castle.x < xBeforeReconnectInput);

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
      projectiles: display.state.game.display.friendlyProjectiles.size,
      turretAngle: display.state.game.turretAngle,
      projectileAngle,
      shieldActive: display.state.game.shield.active,
      shieldEnergy: display.state.game.shield.energy,
      displayLatencyMs: display.state.displayLatencyMs,
      playerLatencies: [...display.state.players.values()].map((player) => player.latencyMs),
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
  const room = await new Client(endpoint).joinById(roomId, {
    role: "controller",
    protocolVersion,
    playerName
  });
  attachLatencyResponder(room);
  return room;
}

function attachLatencyResponder(room) {
  room.onMessage(serverMessage.latencyProbe, (payload) => {
    const result = serverLatencyProbeSchema.safeParse(payload);
    if (!result.success) return;
    room.send(clientMessage.latencyPong, {
      protocolVersion,
      roomId: room.roomId,
      probeId: result.data.probeId
    });
  });
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
