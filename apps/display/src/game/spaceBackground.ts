import type { NebulaPreset } from "@spaceship-defender/protocol";

export type BackgroundLayerKind = "stars" | "nebula-a" | "nebula-b" | "dust";

/** Blend mode of the layer; mapped to Phaser.BlendModes in the scene. */
export type BackgroundBlendMode = "normal" | "screen" | "add";

export interface BackgroundLayerConfig {
  readonly kind: BackgroundLayerKind;
  /** Fraction of camera scroll the layer follows, per axis (demo values). */
  readonly factorX: number;
  readonly factorY: number;
  /** Idle drift in texture pixels per second at driftSpeed multiplier 1. */
  readonly driftX: number;
  readonly driftY: number;
  readonly tileScale: number;
  readonly blendMode: BackgroundBlendMode;
}

/** Far to near; all below the arena (depths 0-3) so no other layer shifts. */
export const BACKGROUND_LAYER_DEPTH: Record<BackgroundLayerKind, number> = {
  stars: -4,
  "nebula-a": -3,
  "nebula-b": -2,
  dust: -1
};

/** Far to near; factors and drifts carried over one-to-one from the demo. */
export const BACKGROUND_LAYERS: readonly BackgroundLayerConfig[] = [
  {
    kind: "stars",
    factorX: 0.018,
    factorY: 0.018,
    driftX: 0,
    driftY: 0,
    tileScale: 1,
    blendMode: "normal"
  },
  {
    kind: "nebula-a",
    factorX: 0.055,
    factorY: 0.045,
    driftX: 4.5,
    driftY: 1.8,
    tileScale: 1,
    blendMode: "screen"
  },
  {
    kind: "nebula-b",
    factorX: -0.095,
    factorY: 0.075,
    driftX: -7,
    driftY: 3.2,
    tileScale: 0.72,
    blendMode: "add"
  },
  {
    kind: "dust",
    factorX: 0.19,
    factorY: 0.16,
    driftX: 11,
    driftY: 0,
    tileScale: 1,
    blendMode: "add"
  }
];

/** Texture keys for the six PNGs in public/textures; all preloaded up front. */
export const BACKGROUND_TEXTURE_KEYS = [
  "bg-stars",
  "bg-dust",
  "bg-nebula-blue",
  "bg-nebula-gold",
  "bg-nebula-purple",
  "bg-nebula-green"
] as const;

export function backgroundTextureKey(kind: BackgroundLayerKind, preset: NebulaPreset): string {
  if (kind === "stars") return "bg-stars";
  if (kind === "dust") return "bg-dust";
  return `bg-nebula-${preset}`;
}

/** Stars and dust keep fixed alpha; both nebula layers scale with the snapshot's nebulaAlpha. */
export function backgroundLayerAlpha(kind: BackgroundLayerKind, nebulaAlpha: number): number {
  switch (kind) {
    case "stars":
      return 1;
    case "dust":
      return 0.7;
    case "nebula-a":
      return nebulaAlpha * 0.86;
    case "nebula-b":
      return nebulaAlpha * 0.34;
  }
}

export function isNebulaLayer(kind: BackgroundLayerKind): boolean {
  return kind === "nebula-a" || kind === "nebula-b";
}
