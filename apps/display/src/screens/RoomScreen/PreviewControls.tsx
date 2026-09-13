import {
  CAMERA_VIEW_ASPECT,
  CAMERA_VIEW_WIDTH_MAX,
  CAMERA_VIEW_WIDTH_MIN,
  type HudSkin
} from "@spaceship-defender/protocol";
import {
  PreviewPhaseButtons,
  PreviewShell,
  type PreviewPhase
} from "@spaceship-defender/client-shared";

export function PreviewControls({
  phase,
  onPhaseChange,
  cameraViewWidth,
  onCameraViewWidthChange,
  hudSkin,
  onHudSkinChange
}: {
  readonly phase: PreviewPhase;
  readonly onPhaseChange: (phase: PreviewPhase) => void;
  readonly cameraViewWidth: number;
  readonly onCameraViewWidthChange: (cameraViewWidth: number) => void;
  readonly hudSkin: HudSkin;
  readonly onHudSkinChange: (hudSkin: HudSkin) => void;
}) {
  return (
    <PreviewShell>
      <PreviewPhaseButtons phase={phase} onPhaseChange={onPhaseChange} />
      <label className="preview-controls__skin">
        <span>Оформление HUD</span>
        <select
          value={hudSkin}
          data-testid="preview-hud-skin"
          onChange={(event) => {
            onHudSkinChange(event.target.value as HudSkin);
          }}
        >
          <option value="classic">классика</option>
          <option value="frame">рамки</option>
        </select>
      </label>
      <label className="preview-controls__camera">
        <span>
          Кадр камеры {cameraViewWidth} × {Math.round(cameraViewWidth * CAMERA_VIEW_ASPECT)}
        </span>
        <input
          type="range"
          min={CAMERA_VIEW_WIDTH_MIN}
          max={CAMERA_VIEW_WIDTH_MAX}
          step={50}
          value={cameraViewWidth}
          data-testid="preview-camera-view-width"
          onChange={(event) => {
            onCameraViewWidthChange(Number(event.target.value));
          }}
        />
      </label>
    </PreviewShell>
  );
}
