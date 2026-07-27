import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { Client } from "@colyseus/sdk";

const port = 35_677;
const protocolVersion = 4;
const endpoint = `ws://127.0.0.1:${String(port)}`;
const healthEndpoint = `http://127.0.0.1:${String(port)}/health`;
const serverEntry = fileURLToPath(new URL("../../server/dist/index.js", import.meta.url));
const serverProcess = spawn(process.execPath, [serverEntry], {
  env: {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: String(port),
    RECONNECTION_GRACE_SECONDS: "1",
    SIMULATION_INTERVAL_MS: "100"
  },
  stdio: "ignore",
  windowsHide: true
});

let display;
let first;
let second;
let replacement;

try {
  await waitForServer();
  await expectControllerCreationToFail();

  display = await new Client(endpoint).create("town_defenders", {
    role: "display",
    protocolVersion,
    playerCapacity: 2
  });
  first = await new Client(endpoint).joinById(display.roomId, {
    role: "controller",
    protocolVersion,
    playerName: "Alex"
  });
  second = await new Client(endpoint).joinById(display.roomId, {
    role: "controller",
    protocolVersion,
    playerName: "Sam"
  });

  await waitFor(() => display.state.players.size === 2);
  first.send("player:ready", { protocolVersion, ready: true });
  second.send("player:ready", { protocolVersion, ready: true });
  await waitFor(() => display.state.phase === "active" && display.state.hasGame === true);

  const firstPlayerId = first.sessionId;
  const secondPlayerId = second.sessionId;
  const firstSectorId = display.state.players.get(firstPlayerId).sectorId;
  const firstSector = () => display.state.game.sectors[firstSectorId];

  const invalidMessageError = nextServerError(first);
  const treasuryBeforeInvalid = display.state.game.treasury;
  first.send("player:upgrade", {
    protocolVersion: protocolVersion + 1,
    roomId: display.roomId,
    playerId: firstPlayerId,
    actionId: crypto.randomUUID()
  });
  const invalidMessageResult = await invalidMessageError;
  if (
    invalidMessageResult?.code !== "protocol_mismatch" ||
    display.state.game.treasury !== treasuryBeforeInvalid
  ) {
    throw new Error("Invalid command changed authoritative state.");
  }

  const upgradeActionId = crypto.randomUUID();
  first.send("player:upgrade", {
    protocolVersion,
    roomId: display.roomId,
    playerId: firstPlayerId,
    actionId: upgradeActionId
  });
  await waitFor(() => firstSector()?.defenseLevel === 2);
  const treasuryAfterUpgrade = display.state.game.treasury;
  const collisionError = nextServerError(second);
  second.send("player:upgrade", {
    protocolVersion,
    roomId: display.roomId,
    playerId: secondPlayerId,
    actionId: upgradeActionId
  });
  const collisionResult = await collisionError;
  await delay(150);
  if (
    collisionResult?.code !== "invalid_message" ||
    firstSector()?.defenseLevel !== 2 ||
    display.state.game.treasury !== treasuryAfterUpgrade
  ) {
    throw new Error("Room-wide actionId deduplication failed.");
  }

  const firstSessionId = first.sessionId;
  const firstReconnectionToken = first.reconnectionToken;
  first.reconnection.enabled = false;
  first.connection.close();
  await waitFor(() => display.state.players.get(firstSessionId)?.connected === false);
  first = await new Client(endpoint).reconnect(firstReconnectionToken);
  await waitFor(() => display.state.players.get(firstSessionId)?.connected === true);
  if (first.sessionId !== firstSessionId) {
    throw new Error("Controller identity changed after reconnection.");
  }

  const displayReconnectionToken = display.reconnectionToken;
  display.reconnection.enabled = false;
  display.connection.close();
  await waitFor(() => first.state.displayConnected === false);
  let secondDisplayWasRejected = false;
  try {
    await new Client(endpoint).joinById(display.roomId, {
      role: "display",
      protocolVersion
    });
  } catch {
    secondDisplayWasRejected = true;
  }
  if (!secondDisplayWasRejected) {
    throw new Error("A second display occupied a reserved display identity.");
  }
  display = await new Client(endpoint).reconnect(displayReconnectionToken);
  await waitFor(() => first.state.displayConnected === true);

  const expiredSessionId = second.sessionId;
  const expiredSectorId = display.state.players.get(expiredSessionId).sectorId;
  const expiredReconnectionToken = second.reconnectionToken;
  second.reconnection.enabled = false;
  second.connection.close();
  await waitFor(() => display.state.players.get(expiredSessionId)?.connected === false);
  await waitFor(() => !display.state.players.has(expiredSessionId), 100);
  let expiredTokenWasRejected = false;
  try {
    await new Client(endpoint).reconnect(expiredReconnectionToken);
  } catch {
    expiredTokenWasRejected = true;
  }
  if (!expiredTokenWasRejected) {
    throw new Error("An expired reconnection token was accepted.");
  }
  second = undefined;

  replacement = await new Client(endpoint).joinById(display.roomId, {
    role: "controller",
    protocolVersion,
    playerName: "Replacement"
  });
  await waitFor(
    () => display.state.players.get(replacement.sessionId)?.sectorId === expiredSectorId
  );

  await waitFor(
    () =>
      display.state.game.waveNumber >= 3 &&
      display.state.game.stage === "combat" &&
      display.state.game.airstrikeCharge === display.state.game.airstrikeChargeRequired &&
      display.state.game.display.enemies.length > 0,
    500
  );
  const airstrikeTargetSectorId = display.state.game.display.enemies[0].sectorId;
  if (replacement.state.game.display !== undefined) {
    throw new Error("Controller received the display-only enemy collection.");
  }
  const compactTargetSector = replacement.state.game.sectors[airstrikeTargetSectorId];
  if (
    (compactTargetSector?.enemyCount ?? 0) <= 0 ||
    compactTargetSector?.airstrikeTargetAvailable !== true
  ) {
    throw new Error("Controller did not receive the compact sector projection.");
  }
  const airstrikeActionId = crypto.randomUUID();
  replacement.send("player:airstrike", {
    protocolVersion,
    roomId: display.roomId,
    playerId: replacement.sessionId,
    actionId: airstrikeActionId,
    targetSectorId: airstrikeTargetSectorId
  });
  await waitFor(
    () =>
      display.state.game.display.hasLastAirstrikeEffect === true &&
      display.state.game.display.lastAirstrikeEffect.sequence === 1
  );
  const treasuryAfterAirstrike = display.state.game.treasury;
  replacement.send("player:airstrike", {
    protocolVersion,
    roomId: display.roomId,
    playerId: replacement.sessionId,
    actionId: airstrikeActionId,
    targetSectorId: airstrikeTargetSectorId
  });
  await delay(150);
  if (
    display.state.game.display.lastAirstrikeEffect.sequence !== 1 ||
    display.state.game.treasury !== treasuryAfterAirstrike
  ) {
    throw new Error("Airstrike actionId deduplication failed.");
  }

  const replacementSector = () => display.state.game.sectors[expiredSectorId];
  await waitFor(() => replacementSector()?.gateHealth < replacementSector()?.gateMaxHealth, 500);
  const healthBeforeRepair = replacementSector().gateHealth;
  replacement.send("player:repair", {
    protocolVersion,
    roomId: display.roomId,
    playerId: replacement.sessionId,
    actionId: crypto.randomUUID()
  });
  await waitFor(() => replacementSector()?.gateHealth > healthBeforeRepair);

  console.log(
    JSON.stringify({
      roomId: display.roomId,
      players: display.state.players.size,
      phase: display.state.phase,
      result: display.state.game.result,
      waveNumber: display.state.game.waveNumber,
      airstrikeSequence: display.state.game.display.lastAirstrikeEffect.sequence,
      repairedGateHealth: replacementSector().gateHealth,
      upgradedDefenseLevel: firstSector().defenseLevel
    })
  );
} finally {
  await Promise.allSettled([
    first?.leave(),
    second?.leave(),
    replacement?.leave(),
    display?.leave()
  ]);
  serverProcess.kill();
}

async function expectControllerCreationToFail() {
  let controllerRoom;
  try {
    controllerRoom = await new Client(endpoint).create("town_defenders", {
      role: "controller",
      protocolVersion,
      playerName: "Invalid creator"
    });
  } catch {
    return;
  } finally {
    await controllerRoom?.leave();
  }

  throw new Error("A controller unexpectedly created a room.");
}

async function waitForServer() {
  await waitFor(async () => {
    try {
      const response = await fetch(healthEndpoint);
      return response.ok;
    } catch {
      return false;
    }
  });
}

async function waitFor(predicate, maximumAttempts = 60) {
  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    if (await predicate()) {
      return;
    }
    await delay(50);
  }

  throw new Error("Network smoke-test timed out.");
}

async function nextServerError(room) {
  return await Promise.race([
    new Promise((resolve) => {
      room.onMessage("server:error", resolve);
    }),
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error("Server did not return the expected error."));
      }, 1_000);
    })
  ]);
}

async function delay(milliseconds) {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
