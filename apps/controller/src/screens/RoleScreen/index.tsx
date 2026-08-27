import { roleLabel } from "@spaceship-defender/client-shared";
import type {
  CrewRole,
  EncounterPhase,
  PublicMachineGunView,
  PublicShieldView,
  PublicWeaponHeatView
} from "@spaceship-defender/protocol";

import { VirtualStick } from "../../VirtualStick.js";
import type { ControlState } from "../../model/control.js";
import { GunnerPanel } from "./GunnerPanel.js";
import { PilotPanel } from "./PilotPanel.js";
import { ShieldPanel } from "./ShieldPanel.js";
import { useRoleControls } from "./useRoleControls.js";

interface RoleScreenProps {
  readonly role: CrewRole;
  readonly cannon: PublicWeaponHeatView | undefined;
  readonly machineGun: PublicMachineGunView | undefined;
  readonly shield: PublicShieldView | undefined;
  readonly encounterPhase: EncounterPhase | undefined;
  readonly connectionDisabled: boolean;
  readonly generation: string;
  readonly hidden: boolean;
  readonly onSend: (sequence: number, control: ControlState) => void;
}

export function RoleScreen({
  role,
  shield,
  cannon,
  machineGun,
  encounterPhase,
  connectionDisabled,
  generation,
  hidden,
  onSend
}: RoleScreenProps) {
  const {
    controlsEnabled,
    updateAim,
    releaseAim,
    cancelAim,
    beginFire,
    endFire,
    cancelFire,
    toggleShield
  } = useRoleControls({
    role,
    shield,
    encounterPhase,
    connectionDisabled,
    generation,
    onSend
  });

  return (
    <div className="role-control" data-role={role} hidden={hidden}>
      <p className="phase-copy">{roleHelp(role)}</p>
      <VirtualStick
        label={`Направление: ${roleLabel(role)}`}
        onChange={updateAim}
        onRelease={releaseAim}
        onCancel={cancelAim}
        enabled={controlsEnabled}
        resetKey={generation}
      />
      {role === "pilot" && (
        <PilotPanel
          machineGun={machineGun}
          controlsEnabled={controlsEnabled}
          generation={generation}
          onFireBegin={beginFire}
          onFireEnd={endFire}
          onFireCancel={cancelFire}
        />
      )}
      {role === "gunner" && (
        <GunnerPanel
          cannon={cannon}
          controlsEnabled={controlsEnabled}
          generation={generation}
          onFireBegin={beginFire}
          onFireEnd={endFire}
          onFireCancel={cancelFire}
        />
      )}
      {role === "shield" && shield !== undefined && (
        <ShieldPanel
          shield={shield}
          controlsEnabled={controlsEnabled}
          generation={generation}
          onToggle={toggleShield}
        />
      )}
      <small>
        Desktop:{" "}
        {role === "pilot" ? "WASD или стрелки, Space — огонь из носа" : "мышь/стрелки + Space"}
      </small>
    </div>
  );
}

function roleHelp(role: CrewRole): string {
  return role === "pilot"
    ? "Ведите корабль через космическое поле"
    : role === "gunner"
      ? "Направляйте пушку и удерживайте огонь"
      : "Направляйте и удерживайте защитный сектор";
}
