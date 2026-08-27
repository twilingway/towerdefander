import type { PublicShieldView } from "@spaceship-defender/protocol";

import { ActionZone } from "../../ActionZone.js";
import { Meter } from "../../components/Meter/index.js";

interface ShieldPanelProps {
  readonly shield: PublicShieldView;
  readonly controlsEnabled: boolean;
  readonly generation: string;
  readonly onToggle: () => void;
}

export function ShieldPanel({ shield, controlsEnabled, generation, onToggle }: ShieldPanelProps) {
  return (
    <>
      <ActionZone
        label={
          shield.active
            ? "ВЫКЛЮЧИТЬ ЩИТ"
            : shield.energy <= 0
              ? "ЩИТ ВОССТАНАВЛИВАЕТСЯ"
              : "ВКЛЮЧИТЬ ЩИТ"
        }
        testId="shield-button"
        className="hold-action--shield"
        disabled={!controlsEnabled || (!shield.active && shield.energy <= 0)}
        mode="toggle"
        active={shield.active}
        resetKey={generation}
        onToggle={onToggle}
      />
      <div className="control-readout">
        <Meter
          className="shield-energy"
          label="Энергия щита"
          value={shield.energy}
          capacity={shield.capacity}
        />
        <strong>
          Энергия {Math.round(shield.energy)} / {Math.round(shield.capacity)}
        </strong>
      </div>
    </>
  );
}
