import type {
  EncounterPhase,
  PublicHelmView,
  PublicMachineGunView,
  PublicWeaponHeatView
} from "@spaceship-defender/protocol";

import { ActionZone } from "../../ActionZone.js";
import { VirtualStick } from "../../VirtualStick.js";
import { Meter } from "../../components/Meter/index.js";
import type { ControlState } from "../../model/control.js";
import {
  DEFAULT_SOLO_LAYOUT,
  SOLO_LAYOUTS,
  soloLayoutLabel,
  type SoloLayout
} from "../../soloLayout.js";
import { useRoleControls } from "./useRoleControls.js";
import { usePilotKeyboard } from "./usePilotKeyboard.js";

interface SoloPanelProps {
  readonly cannon: PublicWeaponHeatView | undefined;
  readonly machineGun: PublicMachineGunView | undefined;
  /** Authoritative hull heading; the keyboard burns along it. */
  readonly helm: PublicHelmView | undefined;
  readonly encounterPhase: EncounterPhase | undefined;
  readonly connectionDisabled: boolean;
  readonly generation: string;
  readonly layout: SoloLayout;
  readonly onLayoutChange: (layout: SoloLayout) => void;
  readonly onSend: (sequence: number, control: ControlState, channel: "pilot" | "gunner") => void;
}

/**
 * One player flying and manning the turret: two sticks and two triggers on a
 * single panel. Each half drives its own control stream, so the room sees the
 * same `pilot:input` and `gunner:input` a two-player crew would send.
 */
export function SoloPanel({
  cannon,
  machineGun,
  helm,
  encounterPhase,
  connectionDisabled,
  generation,
  layout,
  onLayoutChange,
  onSend
}: SoloPanelProps) {
  const pilot = useRoleControls({
    role: "pilot",
    shield: undefined,
    encounterPhase,
    connectionDisabled,
    generation,
    // Both halves stay off the keyboard: usePilotKeyboard owns every key here,
    // and a second listener would fight it for the same control state — the
    // role hook reads WASD as an absolute bearing, this panel as tank steering.
    keyboard: false,
    onSend: (sequence, control) => {
      onSend(sequence, control, "pilot");
    }
  });
  const gunner = useRoleControls({
    role: "gunner",
    shield: undefined,
    encounterPhase,
    connectionDisabled,
    generation,
    keyboard: false,
    onSend: (sequence, control) => {
      onSend(sequence, control, "gunner");
    }
  });
  const controlsEnabled = pilot.controlsEnabled;
  usePilotKeyboard({ controlsEnabled, tuning: helm, pilot, gunner });

  return (
    <div className={`solo-panel solo-panel--${layout}`} data-testid="solo-panel">
      <div className="solo-fire solo-fire--pilot">
        <ActionZone
          label={machineGun?.overheated ? "ПЕРЕГРЕВ" : "ОГОНЬ ИЗ НОСА"}
          testId="mg-fire-button"
          className={`hold-action--pilot${machineGun?.overheated ? " is-overheated" : ""}`}
          disabled={!controlsEnabled}
          mode="hold"
          resetKey={generation}
          onBegin={pilot.beginFire}
          onEnd={pilot.endFire}
          onCancel={pilot.cancelFire}
        />
      </div>
      <div className="solo-fire solo-fire--gunner">
        <ActionZone
          label={cannon?.overheated ? "ПЕРЕГРЕВ" : "ОГОНЬ ТУРЕЛИ"}
          testId="fire-button"
          className={`hold-action--gunner${cannon?.overheated ? " is-overheated" : ""}`}
          disabled={!controlsEnabled}
          mode="hold"
          resetKey={generation}
          onBegin={gunner.beginFire}
          onEnd={gunner.endFire}
          onCancel={gunner.cancelFire}
        />
      </div>
      <div className="solo-stick solo-stick--pilot">
        <VirtualStick
          label="Направление: курс и тяга"
          onChange={pilot.updateAim}
          onRelease={pilot.releaseAim}
          onCancel={pilot.cancelAim}
          enabled={controlsEnabled}
          resetKey={generation}
        />
      </div>
      <div className="solo-stick solo-stick--gunner">
        <VirtualStick
          label="Направление: турель"
          onChange={gunner.updateAim}
          onRelease={gunner.releaseAim}
          onCancel={gunner.cancelAim}
          enabled={controlsEnabled}
          resetKey={generation}
        />
      </div>
      <div className="solo-readout">
        {machineGun !== undefined && (
          <div className="control-readout" data-testid="solo-mg-heat">
            <Meter
              className="shield-energy mg-heat"
              label="Нагрев носового пулемёта"
              value={machineGun.heat}
              capacity={machineGun.capacity}
            />
          </div>
        )}
        {cannon !== undefined && (
          <div className="control-readout" data-testid="solo-cannon-heat">
            <Meter
              className="shield-energy mg-heat"
              label="Нагрев орудия наводчика"
              value={cannon.heat}
              capacity={cannon.capacity}
            />
          </div>
        )}
        <button
          type="button"
          className="solo-layout-toggle"
          data-testid="solo-layout-toggle"
          // The label names where the triggers are right now; tapping moves
          // them, so a player who lost track can read the panel instead of
          // guessing which half of the pair they are looking at.
          title={`Переключить на: ${soloLayoutLabel(nextLayout(layout))}`}
          onClick={() => {
            onLayoutChange(nextLayout(layout));
          }}
        >
          {soloLayoutLabel(layout)}
        </button>
      </div>
    </div>
  );
}

function nextLayout(layout: SoloLayout): SoloLayout {
  const index = SOLO_LAYOUTS.indexOf(layout);
  return SOLO_LAYOUTS[(index + 1) % SOLO_LAYOUTS.length] ?? DEFAULT_SOLO_LAYOUT;
}
