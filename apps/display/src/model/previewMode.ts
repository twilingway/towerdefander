import type { PreviewPhase } from "@spaceship-defender/client-shared";
import type { DisplayRoomView } from "@spaceship-defender/protocol";

import { createPreviewGame } from "./preview/phases.js";
import { PREVIEW_CAMERA_VIEW_WIDTH, PREVIEW_PLAYERS } from "./preview/world.js";

/**
 * Dev-only layout preview: the display renders a fixture instead of creating a
 * room, so HUD, overlays and one Phaser frame can be inspected without a server.
 * Fixtures mirror `toDisplayRoomView` output and are parsed by the protocol
 * schema in tests.
 */
export function createPreviewRoomView(
  phase: PreviewPhase,
  cameraViewWidth: number = PREVIEW_CAMERA_VIEW_WIDTH
): DisplayRoomView {
  return {
    roomId: "PREVIEW",
    phase: phase === "lobby" ? "lobby" : "active",
    runNumber: phase === "lobby" ? 0 : 1,
    crewSize: 3,
    shipArchetypeId: "guardian",
    maintenanceActive: false,
    maintenanceSecondsRemaining: 0,
    displayConnected: true,
    displayLatencyMs: 18,
    players: [...PREVIEW_PLAYERS],
    game: phase === "lobby" ? null : createPreviewGame(phase, cameraViewWidth)
  };
}
