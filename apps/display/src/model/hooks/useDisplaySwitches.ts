import { useCallback, useState } from "react";

export interface DisplaySwitches {
  readonly predictionEnabled: boolean;
  readonly vectorsEnabled: boolean;
  readonly interfaceEnabled: boolean;
  readonly opaquePanels: boolean;
  readonly togglePrediction: () => void;
  readonly toggleVectors: () => void;
  readonly toggleInterface: () => void;
  readonly toggleOpaquePanels: () => void;
}

/**
 * The four switches on the instrument panel, each of which exists to answer one
 * question on the device rather than by taste:
 *
 * - prediction off draws the ship from the authoritative angles alone, which is
 *   the only way comparing the two means anything - one connection, one tick;
 * - vectors are the five overlays the scene rebuilds every frame;
 * - interface off leaves the page as the canvas, so whatever is left is the
 *   renderer;
 * - opaque panels stop the compositor drawing the arena behind them and
 *   blending on top every frame.
 */
export function useDisplaySwitches(): DisplaySwitches {
  const [predictionEnabled, setPredictionEnabled] = useState(true);
  const [vectorsEnabled, setVectorsEnabled] = useState(true);
  const [interfaceEnabled, setInterfaceEnabled] = useState(true);
  const [opaquePanels, setOpaquePanels] = useState(false);

  return {
    predictionEnabled,
    vectorsEnabled,
    interfaceEnabled,
    opaquePanels,
    togglePrediction: useCallback(() => {
      setPredictionEnabled((enabled) => !enabled);
    }, []),
    toggleVectors: useCallback(() => {
      setVectorsEnabled((enabled) => !enabled);
    }, []),
    toggleInterface: useCallback(() => {
      setInterfaceEnabled((enabled) => !enabled);
    }, []),
    toggleOpaquePanels: useCallback(() => {
      setOpaquePanels((opaque) => !opaque);
    }, [])
  };
}
