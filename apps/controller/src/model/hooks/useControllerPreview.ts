import { useMemo, useState } from "react";
import {
  CREW_ROLES,
  type ControllerRoomView,
  type CrewRole,
  type CrewSize,
  type PublicPlayerView
} from "@spaceship-defender/protocol";
import { isPreviewMode, type PreviewPhase } from "@spaceship-defender/client-shared";

import { readBrowserSearch } from "../browser.js";
import { createPreviewRoomView, previewPlayerId } from "../previewMode.js";
import { findCurrentPlayer } from "../roomView.js";

export interface ControllerPreview {
  readonly view: ControllerRoomView;
  readonly playerId: string;
  readonly currentPlayer: PublicPlayerView | undefined;
  readonly role: CrewRole;
  readonly phase: PreviewPhase;
  readonly crewSize: CrewSize;
  readonly onRoleChange: (role: CrewRole) => void;
  readonly onPhaseChange: (phase: PreviewPhase) => void;
  readonly onCrewSizeChange: (crewSize: CrewSize) => void;
}

/**
 * The layout fixture, or nothing outside preview mode. Its presence is what
 * every caller means by "this screen is a fixture": it feeds the same view
 * state the network fills, so the panels render through the production path
 * instead of a second copy.
 */
export function useControllerPreview(): ControllerPreview | undefined {
  const [role, setRole] = useState<CrewRole>("pilot");
  const [phase, setPhase] = useState<PreviewPhase>("combat");
  const [crewSize, setCrewSize] = useState<CrewSize>(3);
  const active = isPreviewMode(readBrowserSearch(), import.meta.env.DEV);
  // Dropping to a smaller crew takes the later seats away, so the role follows
  // the fixture back to the pilot instead of pointing at a player who is gone.
  const seat = CREW_ROLES.slice(0, crewSize).includes(role) ? role : "pilot";
  const view = useMemo(
    () => (active ? createPreviewRoomView(seat, phase, crewSize) : undefined),
    [active, crewSize, phase, seat]
  );
  if (view === undefined) return undefined;
  return {
    view,
    playerId: previewPlayerId(seat),
    currentPlayer: findCurrentPlayer(view, previewPlayerId(seat)),
    role: seat,
    phase,
    crewSize,
    onRoleChange: setRole,
    onPhaseChange: setPhase,
    onCrewSizeChange: setCrewSize
  };
}
