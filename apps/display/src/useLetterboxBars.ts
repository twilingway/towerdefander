import { CAMERA_VIEW_ASPECT } from "@spaceship-defender/protocol";
import { useEffect, useState, type RefObject } from "react";

import { getLetterboxBars, getResponsiveViewport } from "./game/spaceshipViewModel.js";

/**
 * Where the letterbox leaves room on this glass, for the readouts to move into.
 *
 * The frame is a fixed slice of world, so anything that is not its shape has
 * bars - a fifth of a phone held sideways - and until now those sat empty while
 * the readouts lay across the battlefield. The arithmetic is the scene's own
 * `getResponsiveViewport`, called here on the same numbers, so the strip the
 * markup uses and the frame the camera draws cannot disagree.
 */
export function useLetterboxBars(
  host: RefObject<HTMLElement | null>,
  cameraViewWidth: number,
  active: boolean
): { readonly thickness: number; readonly placement: "side" | "top" | "none" } {
  const [bars, setBars] = useState<{
    thickness: number;
    placement: "side" | "top" | "none";
  }>({ thickness: 0, placement: "none" });

  useEffect(() => {
    const element = host.current;
    if (element === null || !active) {
      setBars({ thickness: 0, placement: "none" });
      return;
    }
    const measure = (): void => {
      const { width, height } = element.getBoundingClientRect();
      const viewport = getResponsiveViewport(
        width,
        height,
        cameraViewWidth,
        cameraViewWidth * CAMERA_VIEW_ASPECT
      );
      setBars(
        getLetterboxBars(width, height, {
          width: viewport.screen.width,
          height: viewport.screen.height
        })
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [host, cameraViewWidth, active]);

  return bars;
}
