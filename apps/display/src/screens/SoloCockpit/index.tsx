import type { ControlVector } from "@spaceship-defender/client-shared";

import { CockpitStick } from "./CockpitStick.js";
import { CockpitTrigger } from "./CockpitTrigger.js";

export interface SoloCockpitProps {
  readonly enabled: boolean;
  readonly driveDeadzoneShare: number;
  readonly aimDeadzoneShare: number;
  readonly onDrive: (vector: ControlVector, strength: number) => void;
  readonly onDriveRelease: () => void;
  readonly onAim: (vector: ControlVector, strength: number) => void;
  readonly onAimRelease: () => void;
  readonly onMachineGunHold: (held: boolean) => void;
  readonly onCannonHold: (held: boolean) => void;
  readonly machineGunHeat: number;
  readonly machineGunOverheated: boolean;
  readonly cannonHeat: number;
  readonly cannonOverheated: boolean;
}

/**
 * The touch overlay the solo player flies with, laid over the battle canvas.
 *
 * Presentational on purpose: it takes plain props and knows nothing about the
 * room, which is what `docs/CODE_STYLE.md` asks for and what lets it be
 * rendered in a test without a provider. Everything that touches the wire is in
 * `model/hooks/useSoloCockpit`.
 */
export function SoloCockpit({
  enabled,
  driveDeadzoneShare,
  aimDeadzoneShare,
  onDrive,
  onDriveRelease,
  onAim,
  onAimRelease,
  onMachineGunHold,
  onCannonHold,
  machineGunHeat,
  machineGunOverheated,
  cannonHeat,
  cannonOverheated
}: SoloCockpitProps) {
  return (
    <div className="solo-cockpit" data-testid="solo-cockpit" aria-hidden={!enabled}>
      <CockpitStick
        side="left"
        label="Курс корабля"
        enabled={enabled}
        deadzoneShare={driveDeadzoneShare}
        onChange={onDrive}
        onRelease={onDriveRelease}
      />
      <div className="solo-cockpit__triggers">
        <CockpitTrigger
          testId="cockpit-trigger-mg"
          label="Нос"
          enabled={enabled}
          heat={machineGunHeat}
          overheated={machineGunOverheated}
          onHoldChange={onMachineGunHold}
        />
        <CockpitTrigger
          testId="cockpit-trigger-cannon"
          label="Орудие"
          enabled={enabled}
          heat={cannonHeat}
          overheated={cannonOverheated}
          onHoldChange={onCannonHold}
        />
      </div>
      <CockpitStick
        side="right"
        label="Наводка турели"
        enabled={enabled}
        deadzoneShare={aimDeadzoneShare}
        onChange={onAim}
        onRelease={onAimRelease}
      />
    </div>
  );
}
