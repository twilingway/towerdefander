import type Phaser from "phaser";
import type { DisplayGameSnapshot } from "@spaceship-defender/protocol";

import { bakeRect } from "../bake.js";
import {
  STATUS_BARS,
  STATUS_FRAME_HEIGHT,
  STATUS_FRAME_URL,
  STATUS_FRAME_WIDTH,
  readStatusLit
} from "../../model/statusFrame.js";

const FRAME_TEXTURE = "hud:ui-status";
/** Above every layer of the world, the highest of which sits in the teens. */
const FRAME_DEPTH = 1000;
/**
 * The page prototype's box, in CSS pixels: half the built width, which is what
 * the frame takes on a 1080p screen, capped at a third of the width, inset from
 * the right and dropped under the header.
 */
const FRAME_CSS_WIDTH = 330;
const FRAME_MAX_SHARE = 0.34;
const FRAME_CSS_RIGHT = 12;
const FRAME_CSS_TOP = 51;
const CELL_TEXTURE_SIZE = 8;
/** Caption height in the source picture's own pixels. */
const LABEL_SOURCE_PX = 26;

/** Queues the frame. A build without it loads nothing, and the layer then draws nothing. */
export function preloadStatusFrame(scene: Phaser.Scene): void {
  if (STATUS_FRAME_URL === undefined || scene.textures.exists(FRAME_TEXTURE)) return;
  scene.load.image(FRAME_TEXTURE, STATUS_FRAME_URL);
}

interface BarCells {
  readonly cells: readonly Phaser.GameObjects.Image[];
  lit: number;
}

/**
 * The example's status frame drawn by the scene (`?hudspike=phaser`).
 *
 * One image of the frame, one image per painted cell from a baked swatch, and a
 * caption per bar made once. A frame only compares four counts; a cell changes
 * visibility when its bar gains or loses one, and the layout is redone only
 * when the camera's size or zoom moved.
 *
 * Fixed to the screen, which under a zoomed camera still scales around the
 * camera's middle: `screen = half * (1 - zoom) + zoom * world`, the same
 * arithmetic the sky is laid out with.
 */
export class StatusFrameLayer {
  private readonly frame: Phaser.GameObjects.Image | undefined;
  private readonly bars: readonly BarCells[];
  private readonly labels: readonly Phaser.GameObjects.Text[];
  private layoutKey = "";

  constructor(scene: Phaser.Scene) {
    if (!scene.textures.exists(FRAME_TEXTURE)) {
      this.frame = undefined;
      this.bars = [];
      this.labels = [];
      return;
    }
    this.frame = scene.add
      .image(0, 0, FRAME_TEXTURE)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(FRAME_DEPTH);
    this.bars = STATUS_BARS.map((bar) => {
      const swatch = bakeRect(
        scene,
        `hud:cell:${bar.key}`,
        CELL_TEXTURE_SIZE,
        CELL_TEXTURE_SIZE,
        (graphics) => {
          graphics.fillStyle(bar.color, 0.95);
          graphics.fillRect(0, 0, CELL_TEXTURE_SIZE, CELL_TEXTURE_SIZE);
          graphics.lineStyle(1, 0xbcefff, 0.75);
          graphics.strokeRect(0.5, 0.5, CELL_TEXTURE_SIZE - 1, CELL_TEXTURE_SIZE - 1);
        }
      );
      return {
        cells: Array.from({ length: bar.cells }, () =>
          scene.add
            .image(0, 0, swatch)
            .setOrigin(0, 0)
            .setScrollFactor(0)
            .setDepth(FRAME_DEPTH + 1)
            .setVisible(false)
        ),
        lit: 0
      };
    });
    this.labels = STATUS_BARS.map((bar) =>
      scene.add
        .text(0, 0, bar.label.toUpperCase(), {
          fontFamily: "system-ui, sans-serif",
          fontStyle: "bold",
          color: "#bcefff"
        })
        .setOrigin(0, 0.5)
        .setScrollFactor(0)
        .setDepth(FRAME_DEPTH + 1)
    );
  }

  update(
    scene: Phaser.Scene,
    renderer: { readonly width: number; readonly height: number },
    snapshot: DisplayGameSnapshot
  ): void {
    if (this.frame === undefined) return;
    const zoom = scene.cameras.main.zoom;
    const key = `${String(renderer.width)}x${String(renderer.height)}@${String(zoom)}`;
    if (key !== this.layoutKey) this.layout(scene, this.frame, key, renderer, zoom);

    const lit = readStatusLit(snapshot);
    this.bars.forEach((bar, index) => {
      const next = lit[index] ?? 0;
      if (bar.lit === next) return;
      bar.cells.forEach((cell, cellIndex) => {
        cell.setVisible(cellIndex < next);
      });
      bar.lit = next;
    });
  }

  private layout(
    scene: Phaser.Scene,
    frame: Phaser.GameObjects.Image,
    key: string,
    renderer: { readonly width: number; readonly height: number },
    zoom: number
  ): void {
    this.layoutKey = key;
    const canvas = scene.game.canvas;
    const pixelsPerCss =
      canvas.clientWidth > 0 ? scene.scale.gameSize.width / canvas.clientWidth : 1;
    const width = Math.min(FRAME_CSS_WIDTH * pixelsPerCss, renderer.width * FRAME_MAX_SHARE);
    const scale = width / STATUS_FRAME_WIDTH;
    const left = renderer.width - FRAME_CSS_RIGHT * pixelsPerCss - width;
    const top = FRAME_CSS_TOP * pixelsPerCss;
    const worldX = (screen: number) => (screen - (renderer.width / 2) * (1 - zoom)) / zoom;
    const worldY = (screen: number) => (screen - (renderer.height / 2) * (1 - zoom)) / zoom;

    frame
      .setPosition(worldX(left), worldY(top))
      .setDisplaySize(width / zoom, (STATUS_FRAME_HEIGHT * scale) / zoom);
    STATUS_BARS.forEach((bar, index) => {
      this.bars[index]?.cells.forEach((cell, cellIndex) => {
        cell
          .setPosition(
            worldX(left + (bar.x + cellIndex * bar.pitch) * scale),
            worldY(top + bar.y * scale)
          )
          .setDisplaySize((bar.width * scale) / zoom, (bar.height * scale) / zoom);
      });
      this.labels[index]
        ?.setPosition(worldX(left + bar.labelX * scale), worldY(top + bar.labelY * scale))
        .setFontSize(Math.max(8, Math.round(LABEL_SOURCE_PX * scale)))
        .setScale(1 / zoom);
    });
  }
}
