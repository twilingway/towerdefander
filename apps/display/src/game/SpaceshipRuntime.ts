import type { DisplayGameSnapshot } from "@spaceship-defender/protocol";
import Phaser from "phaser";

import { watchDevicePixelRatio } from "./devicePixels.js";
import { BASE_VIEWPORT_HEIGHT, BASE_VIEWPORT_WIDTH } from "./scene/camera.js";
import { getBackingStoreSize } from "./viewport.js";
import { announceSceneFrame } from "../model/sceneFrames.js";
import { QUALITY_SETTINGS, type QualityLevel } from "./quality.js";
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
  /** What the scene draws and how often; see `quality.ts`. */
  setQuality(level: QualityLevel): void;
  /**
   * Stops drawing while nothing on the field can move - the result screen -
   * and starts again when it can. The last frame stays on the glass.
   */
  setResting(resting: boolean): void;
  /** Whether the scene is resting, so its frame counter is not read as a verdict. */
  isResting(): boolean;
  destroy(): void;
}

/**
 * Draws the game on every Nth display frame, evenly.
 *
 * Phaser's own limit accumulates time and fires when a whole period has
 * passed, carrying the remainder. On a phone the frame timestamps wobble by a
 * fraction of a millisecond, so two frames of 16.6 fall short of 33.3 and the
 * draw slips to the third - measured on a Redmi 4X, a quarter of the frames at
 * 40 to 60 ms under a limit of 30, which is the judder the limit was meant to
 * remove. This counts display frames instead and decides with half a frame of
 * slack, so a wobble cannot move a draw: 86-92% of the draws started exactly
 * two display frames apart on the same phone.
 *
 * While capped it holds Phaser's own loop stopped every frame, because the game
 * starts that loop itself when it finishes booting - possibly after a cap was
 * set - and two loops would step the game twice.
 */
function createFramePacer(loop: Phaser.Core.TimeStep): {
  setCap(cap: 60 | 30): void;
  stop(): void;
} {
  let frame = 0;
  let capped = false;
  let threshold = 0;
  let last = 0;
  const tick = (now: number): void => {
    frame = requestAnimationFrame(tick);
    if (loop.raf.isRunning) loop.raf.stop();
    if (!loop.running || now - last < threshold) return;
    last = now;
    loop.step(now);
  };
  return {
    setCap(cap) {
      if (cap >= 60) {
        if (!capped) return;
        capped = false;
        cancelAnimationFrame(frame);
        if (loop.running && !loop.raf.isRunning) {
          loop.raf.start(loop.step.bind(loop), loop.forceSetTimeOut, 0);
        }
        return;
      }
      // Half a 60 Hz frame of slack either side of the target period.
      threshold = 1000 / cap - 1000 / 120;
      if (capped) return;
      capped = true;
      last = 0;
      frame = requestAnimationFrame(tick);
    },
    stop() {
      cancelAnimationFrame(frame);
    }
  };
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
       * Trilinear minification for the textures that can have it. Phaser builds
       * mipmaps only for power-of-two textures, which is why the catalogue's
       * sprite sheets are cut into 256 cells: a hull is shown at a few dozen
       * pixels out of its cell, and without a chain it shimmers as it turns.
       * The sky picture is deliberately not a power of two - it is drawn about
       * screen size, and a mipmapped tiled sky is what once drew a moving line.
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
  /*
   * The engine, handed to a measuring script under `?diag=1` and nowhere else.
   * A phone profiled over USB can then hide parts of the scene one at a time
   * and see what each costs the GPU - the one question no panel can answer from
   * inside the page.
   */
  if (new URLSearchParams(globalThis.location.search).get("diag") === "1") {
    (globalThis as { __spaceshipGame?: Phaser.Game }).__spaceshipGame = game;
  }

  /*
   * Resting is Phaser's own sleep, which stops its loop without touching the
   * pause it takes for a hidden tab, and which the pacer already honours: it
   * steps only a running loop. Waking starts from a fresh delta, so the time
   * spent asleep is not handed to the next frame as one enormous step.
   */
  let resting = false;
  const drawOnce = (): void => {
    if (!game.isRunning) return;
    game.loop.resetDelta();
    game.loop.wake();
    game.loop.sleep();
  };
  // The loop starts itself after the game boots - after `READY`, even - which
  // may come after a rest was asked for; the first frame it draws puts it back.
  game.events.once(Phaser.Core.Events.POST_RENDER, () => {
    if (resting) game.loop.sleep();
  });
  // Before the scene updates, so what the HUD writes lands in the frame it draws.
  game.events.on(Phaser.Core.Events.PRE_STEP, announceSceneFrame);
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
    // A resized canvas is a cleared one; a resting scene still owes it a frame.
    if (resting) drawOnce();
  };
  // Two watchers, and they are not the same one twice: the observer hears the
  // box change - rotation, fullscreen, the HUD reflowing around it - and the
  // media query hears the density change under a box that did not move, which
  // is a window dragged to another monitor or the browser zoomed.
  const observer = new ResizeObserver(applyTarget);
  observer.observe(host);
  const unwatchRatio = watchDevicePixelRatio(applyTarget);
  const pacer = createFramePacer(game.loop);

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
    setQuality(level) {
      const settings = QUALITY_SETTINGS[level];
      scene.setQuality(settings);
      pacer.setCap(settings.frameCap);
    },
    setResting(value) {
      if (value === resting) return;
      resting = value;
      if (value) {
        game.loop.sleep();
        return;
      }
      // Before the game starts its loop, starting it is the game's business.
      if (!game.isRunning) return;
      game.loop.resetDelta();
      game.loop.wake();
    },
    isResting() {
      return resting;
    },
    destroy() {
      pacer.stop();
      observer.disconnect();
      unwatchRatio();
      game.destroy(true);
    }
  };
}
