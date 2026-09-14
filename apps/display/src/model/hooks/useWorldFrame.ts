import { CAMERA_VIEW_ASPECT, CAMERA_VIEW_WIDEST_ASPECT } from "@spaceship-defender/protocol";
import { useEffect, type RefObject } from "react";

import { getResponsiveViewport } from "../../game/viewport.js";

/** The custom properties the stylesheet stands the frame HUD against, in CSS pixels. */
export const WORLD_FRAME_PROPERTIES = [
  "--world-left",
  "--world-top",
  "--world-width",
  "--world-height"
] as const;

/**
 * Where the world is drawn on this glass, for the HUD to stand beside.
 *
 * The scene fits the frame with `getResponsiveViewport`; this calls it on the
 * same numbers against the shell's own size, so the rectangle the stylesheet
 * reads and the one the camera draws cannot disagree. The proportions do not
 * depend on the pixel ratio the canvas buffer is drawn at, so CSS pixels are
 * the scene's rectangle scaled, not a different one.
 *
 * Written straight to the shell's style rather than kept in state: a resize
 * moves four numbers, and nothing in the battle tree has to render for it.
 */
export function useWorldFrame(
  host: RefObject<HTMLElement | null>,
  cameraViewWidth: number | undefined
): void {
  useEffect(() => {
    const element = host.current;
    if (element === null) return;
    if (cameraViewWidth === undefined) {
      for (const property of WORLD_FRAME_PROPERTIES) element.style.removeProperty(property);
      return;
    }
    const measure = (): void => {
      const { width, height } = element.getBoundingClientRect();
      const { screen } = getResponsiveViewport(
        width,
        height,
        cameraViewWidth,
        cameraViewWidth * CAMERA_VIEW_ASPECT,
        CAMERA_VIEW_WIDEST_ASPECT
      );
      element.style.setProperty("--world-left", `${screen.x.toFixed(2)}px`);
      element.style.setProperty("--world-top", `${screen.y.toFixed(2)}px`);
      element.style.setProperty("--world-width", `${screen.width.toFixed(2)}px`);
      element.style.setProperty("--world-height", `${screen.height.toFixed(2)}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [host, cameraViewWidth]);
}
