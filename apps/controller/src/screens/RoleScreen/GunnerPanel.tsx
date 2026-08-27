import type { PublicWeaponHeatView } from "@spaceship-defender/protocol";

import { ActionZone } from "../../ActionZone.js";
import { Meter } from "../../components/Meter/index.js";

interface GunnerPanelProps {
  readonly cannon: PublicWeaponHeatView | undefined;
  readonly controlsEnabled: boolean;
  readonly generation: string;
  readonly onFireBegin: () => void;
  readonly onFireEnd: () => void;
  readonly onFireCancel: () => void;
}

export function GunnerPanel({
  cannon,
  controlsEnabled,
  generation,
  onFireBegin,
  onFireEnd,
  onFireCancel
}: GunnerPanelProps) {
  return (
    <>
      <ActionZone
        label={cannon?.overheated ? "ПЕРЕГРЕВ" : "УДЕРЖИВАТЬ ОГОНЬ"}
        testId="fire-button"
        className={`hold-action--gunner${cannon?.overheated ? " is-overheated" : ""}`}
        disabled={!controlsEnabled}
        mode="hold"
        resetKey={generation}
        onBegin={onFireBegin}
        onEnd={onFireEnd}
        onCancel={onFireCancel}
      />
      {cannon !== undefined && (
        <div className="control-readout" data-testid="cannon-heat">
          <Meter
            className="shield-energy mg-heat"
            label="Нагрев орудия наводчика"
            value={cannon.heat}
            capacity={cannon.capacity}
          />
          <strong>
            Нагрев {Math.round(cannon.heat)} / {Math.round(cannon.capacity)}
          </strong>
        </div>
      )}
    </>
  );
}
