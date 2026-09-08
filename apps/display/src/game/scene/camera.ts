import type Phaser from "phaser";
import { CAMERA_VIEW_ASPECT } from "@spaceship-defender/protocol";

import { type Point } from "../spaceshipViewModel.js";
import { getPhaserCameraScroll, getResponsiveViewport } from "../viewport.js";

/** The frame a scene starts on before any glass has been measured. */
export const BASE_VIEWPORT_WIDTH = 1600;
export const BASE_VIEWPORT_HEIGHT = 900;

/**
 * What the viewport spec reads: the camera's pixel rect and its zoom, both in
 * the pixels the scene draws into rather than the CSS pixels the page is laid
 * out in. The two differ by `pixelRatio` on a dense panel, and the slice of
 * world - `width / zoom` - is the same number either way, which is the point.
 */
export interface DisplayCameraSlice {
  readonly width: number;
  readonly height: number;
  readonly zoom: number;
  readonly pixelRatio: number;
  /** The whole glass, letterbox bars included. */
  readonly canvasWidth: number;
  readonly canvasHeight: number;
}

/**
 * The letterboxed frame the crew actually sees, and the arithmetic that keeps
 * it the same slice of arena on every glass.
 *
 * Phaser centres a camera on its own pixel size, and the camera here is the
 * frame rather than the whole canvas - so the scroll is measured against the
 * frame. Nothing is drawn outside it, which is why an ultrawide monitor, a
 * laptop and a tablet all show one slice and differ only in the width of their
 * bars.
 */
export class CameraFrame {
  /**
   * Device pixels per CSS pixel, handed in by whoever sized the buffer. Only
   * numbers measured in absolute pixels care; everything else is world space
   * multiplied by the camera zoom, and the zoom scaled with the buffer.
   */
  private pixelRatio = 1;
  /** The glass, in the same pixels the scene draws into. */
  private canvasWidth = BASE_VIEWPORT_WIDTH;
  private canvasHeight = Math.round(BASE_VIEWPORT_WIDTH * CAMERA_VIEW_ASPECT);
  /** The camera's own pixel rect, which is the frame centred inside the glass. */
  private rendererWidth = BASE_VIEWPORT_WIDTH;
  private rendererHeight = BASE_VIEWPORT_HEIGHT;

  setPixelRatio(ratio: number): void {
    this.pixelRatio = ratio;
  }

  /** The camera's pixel rect, for deciding what has left it. */
  readRendererSize(): { readonly width: number; readonly height: number } {
    return { width: this.rendererWidth, height: this.rendererHeight };
  }

  /** Re-runs the fit on the glass it was last given, for a new framed width. */
  reconfigure(scene: Phaser.Scene, cameraViewWidth: number, focus: Point): void {
    this.configure(scene, this.canvasWidth, this.canvasHeight, cameraViewWidth, focus);
  }

  configure(
    scene: Phaser.Scene,
    actualWidth: number,
    actualHeight: number,
    cameraViewWidth: number,
    focus: Point
  ): void {
    const viewport = getResponsiveViewport(
      actualWidth,
      actualHeight,
      cameraViewWidth,
      cameraViewWidth * CAMERA_VIEW_ASPECT
    );
    this.canvasWidth = actualWidth;
    this.canvasHeight = actualHeight;
    this.rendererWidth = viewport.screen.width;
    this.rendererHeight = viewport.screen.height;
    scene.cameras.main.setZoom(viewport.zoom);
    scene.cameras.main.setViewport(
      viewport.screen.x,
      viewport.screen.y,
      viewport.screen.width,
      viewport.screen.height
    );
    // Published for the viewport spec, which has no other way to ask what the
    // camera is actually showing. Inert otherwise: a plain object, written once
    // per resize.
    (globalThis as { __spaceshipDisplayCamera?: DisplayCameraSlice }).__spaceshipDisplayCamera = {
      width: viewport.screen.width,
      height: viewport.screen.height,
      zoom: viewport.zoom,
      pixelRatio: this.pixelRatio,
      canvasWidth: actualWidth,
      canvasHeight: actualHeight
    };
    this.focusOn(scene, focus);
  }

  focusOn(scene: Phaser.Scene, focus: Point): void {
    const scroll = getPhaserCameraScroll({
      focus,
      rendererWidth: this.rendererWidth,
      rendererHeight: this.rendererHeight
    });
    scene.cameras.main.setScroll(scroll.x, scroll.y);
  }
}
