import {
  PreviewPhaseButtons,
  PreviewShell,
  roleLabel,
  type PreviewPhase
} from "@spaceship-defender/client-shared";
import { CREW_ROLES, type CrewRole } from "@spaceship-defender/protocol";

export function PreviewControls({
  role,
  phase,
  onRoleChange,
  onPhaseChange
}: {
  readonly role: CrewRole;
  readonly phase: PreviewPhase;
  readonly onRoleChange: (role: CrewRole) => void;
  readonly onPhaseChange: (phase: PreviewPhase) => void;
}) {
  return (
    <PreviewShell>
      <div className="preview-controls__group">
        {CREW_ROLES.map((candidate) => (
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
