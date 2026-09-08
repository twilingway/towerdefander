import type { DisplayGameSnapshot } from "@spaceship-defender/protocol";
import Phaser from "phaser";

import { watchDevicePixelRatio } from "./devicePixels.js";
import { BASE_VIEWPORT_HEIGHT, BASE_VIEWPORT_WIDTH } from "./scene/camera.js";
import { getBackingStoreSize } from "./spaceshipViewModel.js";
import { SpaceshipScene } from "./scene/SpaceshipScene.js";
import type { ScenePrediction } from "./scene/entities.js";

export type { ScenePrediction } from "./scene/entities.js";

export interface SpaceshipRuntime {
  update(snapshot: DisplayGameSnapshot): void;
  prepareHydration(): void;
  /** The vector overlays rebuilt every frame, on or off. */
  setVectorsEnabled(enabled: boolean): void;
  /**
   * Steps the prediction, sends its input and returns the pose - in that order,
   * once per drawn frame, from inside the frame.
   */
  setPredictionDriver(prediction: ScenePrediction | undefined): void;
  /**
   * Where to read the newest snapshot at the top of each frame. Given one, the
   * scene stops waiting to be handed snapshots and takes them itself.
   */
  setSnapshotSource(read: (() => DisplayGameSnapshot | undefined) | undefined): void;
  /**
   * Frames a second as the game loop measures them, not as the browser paints
   * them: what the scene manages to draw is the number worth showing.
   */
  readFps(): number;
  /**
   * The longest frame of the last completed second, in milliseconds. A freeze
   * and a low frame rate are different complaints with different causes, and
   * the average above cannot tell them apart.
   */
  /** The mean frame of the last second, beside the worst one. */
  readAverageFrameMs(): number;
  readWorstFrameMs(): number;
  readStutterShare(): number;
  /** What the scene's own per-frame work costs, summed over the last second. */
  readUpdateMsPerSecond(): number;
  readWorstUpdateMs(): number;
  /** How many entities the last frame drew off the predictor rather than a track. */
  readLiveDrawnCount(): number;
  /** How many of them were outside the camera - what an area filter could drop. */
  readOffscreenCount(): number;
  /**
   * Lowers the ceiling on how many device pixels the scene may draw, when the
   * frame counter says this machine cannot afford the one it has. Down only:
   * see `nextPixelRatioCap`.
   */
  setPixelRatioCap(cap: number): void;
  destroy(): void;
}

export interface SpaceshipRuntimeOptions {
  /**
   * Device pixels per CSS pixel the scene may draw at. Overridable so the
   * ceiling can be chosen on the device that pays for it - see `?dpr=`.
   */
  readonly pixelRatioCap?: number;
}

export function createSpaceshipRuntime(
  host: HTMLElement,
  initialSnapshot: DisplayGameSnapshot,
  options: SpaceshipRuntimeOptions = {}
): SpaceshipRuntime {
  const scene = new SpaceshipScene(initialSnapshot);
  /**
   * What to draw into, for the glass we have right now.
   *
   * `Scale.RESIZE` sized the buffer in CSS pixels, which on a phone is a third
   * of the panel in each direction - the arena was rasterised at a ninth of the
   * pixels it was shown at and blown back up, while the HUD beside it was drawn
   * by the browser at full density. Phaser 4 has no setting for this, so the
   * mode goes to `NONE` and the sizing becomes ours: one observer, one call to
   * `scale.resize`, and the engine resizes the renderer, the cameras and the
   * filter targets off the back of it.
   */
  let currentCap = options.pixelRatioCap;
  const target = () => {
    const cssWidth = host.clientWidth > 0 ? host.clientWidth : BASE_VIEWPORT_WIDTH;
    const cssHeight = host.clientHeight > 0 ? host.clientHeight : BASE_VIEWPORT_HEIGHT;
    return getBackingStoreSize({
      cssWidth,
      cssHeight,
      devicePixelRatio: globalThis.devicePixelRatio,
      ...(currentCap === undefined ? {} : { cap: currentCap }),
      // The glow allocates a target the size of the frame, and older mobile
      // parts refuse past this; before boot there is nobody to ask.
      maxDimension: 4096
    });
  };
  const initial = target();
  scene.setPixelRatio(initial.ratio);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: host,
    width: initial.width,
    height: initial.height,
    backgroundColor: "#07171f",
    scene,
    render: {
      antialias: true,
      roundPixels: false,
      /**
       * The background is drawn far smaller than it is stored: the frame is
       * 2500 world units across and the tiles are 512 and 1024 texels, so a
       * texel lands on a third of a pixel on a phone. Sampled one level deep
       * that is undersampling, and it reads as the starfield crawling and
       * sparkling whenever the camera moves. Every one of the six textures is a
       * power of two, so the whole chain is legal - and trilinear minification
       * is cheaper than the aliasing it replaces, not dearer.
       */
      mipmapFilter: "LINEAR_MIPMAP_LINEAR",
      /** Free on a phone, and picks the discrete GPU on a laptop that has two. */
      powerPreference: "high-performance"
    },
    // Ours to size, and ours alone: `RESIZE` would overwrite the buffer with the
    // CSS box on every parent poll, and centring is the stylesheet's job - the
    // canvas is pinned to its box there, so Phaser's margins would be zeroes it
    // recomputed on every refresh.
    scale: { mode: Phaser.Scale.NONE, autoCenter: Phaser.Scale.NO_CENTER }
  });

  const applyTarget = (): void => {
    if (!game.isBooted) return;
    const next = target();
    // Guarded, because the observer also fires for changes that leave the box
    // where it was, and `resize` re-emits the event the scene listens to.
    if (next.width === game.scale.gameSize.width && next.height === game.scale.gameSize.height) {
      return;
    }
    scene.setPixelRatio(next.ratio);
    game.scale.resize(next.width, next.height);
  };
  // Two watchers, and they are not the same one twice: the observer hears the
  // box change - rotation, fullscreen, the HUD reflowing around it - and the
  // media query hears the density change under a box that did not move, which
  // is a window dragged to another monitor or the browser zoomed.
  const observer = new ResizeObserver(applyTarget);
  observer.observe(host);
  const unwatchRatio = watchDevicePixelRatio(applyTarget);

  return {
    update(snapshot) {
      scene.applySnapshot(snapshot);
    },
    prepareHydration() {
      scene.prepareHydration();
    },
    setVectorsEnabled(enabled) {
      scene.setVectorsEnabled(enabled);
    },
    setPredictionDriver(prediction) {
      scene.setPredictionDriver(prediction);
    },
    setSnapshotSource(read) {
      scene.setSnapshotSource(read);
    },
    readFps() {
      return game.loop.actualFps;
    },
    readAverageFrameMs() {
      return scene.readFrames().readAverageFrameMs();
    },
    readWorstFrameMs() {
      return scene.readFrames().readWorstFrameMs();
    },
    readStutterShare() {
      return scene.readFrames().readStutterShare();
    },
    readUpdateMsPerSecond() {
      return scene.readFrames().readUpdateMsPerSecond();
    },
    readWorstUpdateMs() {
      return scene.readFrames().readWorstUpdateMs();
    },
    readLiveDrawnCount() {
      return scene.readFrames().readLiveDrawnCount();
    },
    readOffscreenCount() {
      return scene.readFrames().readOffscreenCount();
    },
    setPixelRatioCap(cap) {
      if (cap === currentCap) return;
      currentCap = cap;
      applyTarget();
    },
    destroy() {
      observer.disconnect();
      unwatchRatio();
      game.destroy(true);
    }
  };
}
