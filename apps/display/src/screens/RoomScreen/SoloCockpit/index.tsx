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
  readonly onCannonFromStick: (held: boolean) => void;
  readonly machineGunHeat: number;
  readonly machineGunOverheated: boolean;
}

/**
 * The touch overlay the solo player flies with, laid over the battle canvas.
 *
 * Presentational on purpose: it takes plain props and knows nothing about the
 * room, which is what `docs/CODE_STYLE.md` asks for and what lets it be
 * rendered in a test without a provider. Everything that touches the wire is in
 * `model/hooks/useSoloCockpit`.
 *
 * There is no assist toggle: the aim assist is being reworked, and until then it
 * keeps whatever this device last chose.
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
  onCannonFromStick,
  machineGunHeat,
  machineGunOverheated
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
      <div className="solo-cockpit__right">
        {/*
          One trigger, right above the stick that aims.
          
          The cannon lost its button because the stick already fires it - two
          controls for one gun is two places to look, and the one under the
          thumb wins. What is left is the nose gun, which has no other way to be
          fired, and it sits where the thumb already is rather than in a row of
          its own across the top.
        */}
        <div className="solo-cockpit__triggers">
          <CockpitTrigger
            testId="cockpit-trigger-mg"
            label="Нос"
            enabled={enabled}
            heat={machineGunHeat}
            overheated={machineGunOverheated}
            onHoldChange={onMachineGunHold}
          />
        </div>
        <CockpitStick
          side="right"
          label="Наводка турели"
          enabled={enabled}
          deadzoneShare={aimDeadzoneShare}
          onChange={onAim}
          onRelease={onAimRelease}
          onPressChange={onCannonFromStick}
        />
      </div>
    </div>
  );
}
