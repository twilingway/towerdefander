import type { PublicMachineGunView } from "@spaceship-defender/protocol";

import { ActionZone } from "../../ActionZone.js";
import { Meter } from "../../components/Meter/index.js";

interface PilotPanelProps {
  readonly machineGun: PublicMachineGunView | undefined;
  readonly controlsEnabled: boolean;
  readonly generation: string;
  readonly onFireBegin: () => void;
  readonly onFireEnd: () => void;
  readonly onFireCancel: () => void;
}

export function PilotPanel({
  machineGun,
  controlsEnabled,
  generation,
  onFireBegin,
  onFireEnd,
  onFireCancel
}: PilotPanelProps) {
  return (
    <>
      <ActionZone
        label={machineGun?.overheated ? "ПЕРЕГРЕВ" : "ОГОНЬ ИЗ НОСА"}
        testId="mg-fire-button"
        className={`hold-action--pilot${machineGun?.overheated ? " is-overheated" : ""}`}
        disabled={!controlsEnabled}
        mode="hold"
        resetKey={generation}
        onBegin={onFireBegin}
        onEnd={onFireEnd}
        onCancel={onFireCancel}
      />
      {machineGun !== undefined && (
        <div className="control-readout">
          <Meter
            className="shield-energy mg-heat"
            label="Нагрев носового пулемёта"
            value={machineGun.heat}
            capacity={machineGun.capacity}
          />
          <strong>
            Нагрев {Math.round(machineGun.heat)} / {Math.round(machineGun.capacity)}
          </strong>
        </div>
      )}
    </>
  );
}
