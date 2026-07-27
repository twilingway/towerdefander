import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { Client } from "@colyseus/sdk";

const port = 35_677;
const endpoint = `ws://127.0.0.1:${String(port)}`;
const healthEndpoint = `http://127.0.0.1:${String(port)}/health`;
const serverEntry = fileURLToPath(new URL("../../server/dist/index.js", import.meta.url));
const serverProcess = spawn(process.execPath, [serverEntry], {
  env: {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: String(port),
    RECONNECTION_GRACE_SECONDS: "1"
  },
  stdio: "ignore",
  windowsHide: true
});

let display;
let first;
let second;

try {
  await waitForServer();

  await expectControllerCreationToFail();

  display = await new Client(endpoint).create("town_defenders", {
    role: "display",
    protocolVersion: 1
  });
  first = await new Client(endpoint).joinById(display.roomId, {
    role: "controller",
    protocolVersion: 1,
    playerName: "Alex"
  });
  second = await new Client(endpoint).joinById(display.roomId, {
    role: "controller",
    protocolVersion: 1,
    playerName: "Sam"
  });

  await waitFor(() => display.state.players.size === 2);

  first.send("player:ready", { protocolVersion: 1, ready: true });
  second.send("player:ready", { protocolVersion: 1, ready: true });
  await waitFor(() => display.state.phase === "active");

  const invalidMessageError = new Promise((resolve) => {
    first.onMessage("server:error", resolve);
  });
  first.send("player:signal", {
    protocolVersion: 2,
    actionId: crypto.randomUUID()
  });
  const invalidMessageResult = await Promise.race([
    invalidMessageError,
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error("Server did not reject an invalid protocol version."));
      }, 1_000);
    })
  ]);
  if (
    invalidMessageResult?.code !== "protocol_mismatch" ||
    display.state.players.get(first.sessionId)?.signalCount !== 0
  ) {
    throw new Error("Invalid command changed authoritative state.");
  }

  const actionId = crypto.randomUUID();
  first.send("player:signal", {
    protocolVersion: 1,
    actionId
  });
  await waitFor(() => display.state.players.get(first.sessionId)?.signalCount === 1);
  second.send("player:signal", { protocolVersion: 1, actionId });
  await new Promise((resolve) => {
    setTimeout(resolve, 100);
  });
  if (display.state.players.get(second.sessionId)?.signalCount !== 0) {
    throw new Error("Room-level actionId deduplication failed.");
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
      protocolVersion: 1
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
  const expiredReconnectionToken = second.reconnectionToken;
  second.reconnection.enabled = false;
  second.connection.close();
  await waitFor(() => display.state.players.get(expiredSessionId)?.connected === false);
  await waitFor(() => !display.state.players.has(expiredSessionId));
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

  console.log(
    JSON.stringify({
      roomId: display.roomId,
      players: display.state.players.size,
      phase: display.state.phase,
      confirmedSignals: display.state.players.get(first.sessionId).signalCount
    })
  );
} finally {
  await Promise.allSettled([first?.leave(), second?.leave(), display?.leave()]);
  serverProcess.kill();
}

async function expectControllerCreationToFail() {
  let controllerRoom;
  try {
    controllerRoom = await new Client(endpoint).create("town_defenders", {
      role: "controller",
      protocolVersion: 1,
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

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
  }

  throw new Error("Network smoke-test timed out.");
}
