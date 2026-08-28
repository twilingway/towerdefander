import { useState } from "react";
import { roleLabel } from "@spaceship-defender/client-shared";
import type {
  CrewRole,
  CrewSize,
  EncounterPhase,
  PublicMachineGunView,
  PublicShieldView,
  PublicWeaponHeatView
} from "@spaceship-defender/protocol";

import { VirtualStick } from "../../VirtualStick.js";
import { readLocalStorage } from "../../model/browser.js";
import type { ControlState } from "../../model/control.js";
import {
  DEFAULT_SOLO_LAYOUT,
  readSoloLayout,
  saveSoloLayout,
  type SoloLayout
} from "../../soloLayout.js";
import { GunnerPanel } from "./GunnerPanel.js";
import { PilotPanel } from "./PilotPanel.js";
import { ShieldPanel } from "./ShieldPanel.js";
import { SoloPanel } from "./SoloPanel.js";
import { usePilotKeyboard } from "./usePilotKeyboard.js";
import { useRoleControls } from "./useRoleControls.js";

interface RoleScreenProps {
  readonly role: CrewRole;
  readonly crewSize: CrewSize;
  readonly heading: number | undefined;
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
  crewSize,
  heading,
  shield,
  cannon,
  machineGun,
  encounterPhase,
  connectionDisabled,
  generation,
  hidden,
  onSend
}: RoleScreenProps) {
  const [soloLayout, setSoloLayout] = useState<SoloLayout>(() => {
    const storage = readLocalStorage();
    return storage === undefined ? DEFAULT_SOLO_LAYOUT : readSoloLayout(storage);
  });
  const controls = useRoleControls({
    role,
    shield,
    encounterPhase,
    connectionDisabled,
    generation,
    // The helm reads WASD as tank steering, so the role hook must not also read
    // it as an absolute bearing; gunner and shield keep their own keys.
    keyboard: role !== "pilot",
    onSend
  });
  const {
    controlsEnabled,
    updateAim,
    releaseAim,
    cancelAim,
    beginFire,
    endFire,
    cancelFire,
    toggleShield
  } = controls;
  // The helm belongs to the pilot seat in every crew size; the solo panel runs
  // its own instance because it also owns the turret.
  usePilotKeyboard({
    active: role === "pilot" && crewSize > 1,
    controlsEnabled,
    heading,
    pilot: controls
  });

  if (crewSize === 1) {
    return (
      <div className="role-control role-control--solo" data-role={role} hidden={hidden}>
        <p className="phase-copy">Ведите корабль и наводите турель; щит держит автопилот</p>
        <SoloPanel
          cannon={cannon}
          machineGun={machineGun}
          heading={heading}
          encounterPhase={encounterPhase}
          connectionDisabled={connectionDisabled}
          generation={generation}
          layout={soloLayout}
          onLayoutChange={(next) => {
            setSoloLayout(next);
            const storage = readLocalStorage();
            if (storage !== undefined) saveSoloLayout(storage, next);
          }}
          onSend={onSend}
        />
      </div>
    );
  }

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
