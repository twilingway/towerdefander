import { useMemo, useState } from "react";
import { PREVIEW_CAMERA_VIEW_WIDTH } from "../../model/previewMode.js";
import type { PublicShip } from "@spaceship-defender/protocol";
import type { PreviewPhase } from "@spaceship-defender/client-shared";

import type { DisplaySwitches } from "../../model/hooks/useDisplaySwitches.js";
import { createPreviewRoomView } from "../../model/previewMode.js";
import { publishWorld } from "../../model/worldStore.js";
import { RoomScreen } from "./index.js";

interface PreviewRoomRouteProps {
  readonly diagnostics: boolean;
  readonly visibleDemo: boolean;
  readonly switches: DisplaySwitches;
  readonly worldReady: boolean;
  readonly ships: readonly PublicShip[] | undefined;
}

/**
 * The room drawn from a fixture instead of a server.
 *
 * The publishing memo lives here, in the parent of the battle tree, and must
 * stay there: the preview is also how the battle screen is rendered to static
 * markup in tests, effects do not run there, and the panels read the world from
 * the store. React runs a parent's body to completion before its children, so
 * the fixture is in the store before the first panel asks for it. Moving this
 * into an effect, or down into the fight, breaks two tests and nothing else
 * would say so.
 */
export function PreviewRoomRoute({
  diagnostics,
  visibleDemo,
  switches,
  worldReady,
  ships
}: PreviewRoomRouteProps) {
  const [phase, setPhase] = useState<PreviewPhase>("combat");
  const [cameraViewWidth, setCameraViewWidth] = useState(PREVIEW_CAMERA_VIEW_WIDTH);
  const view = useMemo(() => {
    const built = createPreviewRoomView(phase, cameraViewWidth);
    publishWorld(built);
    return built;
  }, [phase, cameraViewWidth]);

  return (
    <RoomScreen
      view={view}
      diagnostics={diagnostics}
      visibleDemo={visibleDemo}
      switches={switches}
      worldReady={worldReady}
      ships={ships}
      session={undefined}
      preview={{
        phase,
        onPhaseChange: setPhase,
        cameraViewWidth,
        onCameraViewWidthChange: setCameraViewWidth
      }}
      onCloseRoom={() => undefined}
      onReady={() => undefined}
      onVote={() => undefined}
    />
  );
}
