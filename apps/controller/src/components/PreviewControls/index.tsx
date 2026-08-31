import {
  PreviewPhaseButtons,
  PreviewShell,
  roleLabel,
  type PreviewPhase
} from "@spaceship-defender/client-shared";
import { CREW_ROLES, CREW_SIZES, type CrewRole, type CrewSize } from "@spaceship-defender/protocol";

export function PreviewControls({
  role,
  phase,
  crewSize,
  onRoleChange,
  onPhaseChange,
  onCrewSizeChange
}: {
  readonly role: CrewRole;
  readonly phase: PreviewPhase;
  readonly crewSize: CrewSize;
  readonly onRoleChange: (role: CrewRole) => void;
  readonly onPhaseChange: (phase: PreviewPhase) => void;
  readonly onCrewSizeChange: (crewSize: CrewSize) => void;
}) {
  // Seats follow the crew size, so a solo preview offers the pilot alone and
  // that is the only way to reach the solo panel without a room.
  const seats = CREW_ROLES.slice(0, crewSize);
  return (
    <PreviewShell>
      <div className="preview-controls__group">
        {CREW_SIZES.map((candidate) => (
          <button
            key={candidate}
            type="button"
            aria-pressed={candidate === crewSize}
            onClick={() => {
              onCrewSizeChange(candidate);
            }}
          >
            {crewSizeLabel(candidate)}
          </button>
        ))}
      </div>
      <div className="preview-controls__group">
        {seats.map((candidate) => (
          <button
            key={candidate}
            type="button"
            aria-pressed={candidate === role}
            onClick={() => {
              onRoleChange(candidate);
            }}
          >
            {roleLabel(candidate)}
          </button>
        ))}
      </div>
      <div className="preview-controls__group">
        <PreviewPhaseButtons phase={phase} onPhaseChange={onPhaseChange} />
      </div>
    </PreviewShell>
  );
}

function crewSizeLabel(crewSize: CrewSize): string {
  return crewSize === 1 ? "Соло" : `${String(crewSize)} игрока`;
}
