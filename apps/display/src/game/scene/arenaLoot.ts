import type Phaser from "phaser";
import type { DisplayGameSnapshot } from "@spaceship-defender/protocol";

/** Bakes a drawing centred on zero and hands back its texture key. */
type BakeShape = (
  key: string,
  half: number,
  draw: (graphics: Phaser.GameObjects.Graphics) => void
) => string;

/**
 * The colours the field's drops are read by, and nothing else about them.
 *
 * Steel Hunter's own reading: the common crate is warm, the gear is green, the
 * heavy drop is the cold blue you cross the map for. A pilot sorts them by
 * colour at a distance long before the shape means anything.
 */
const LOOT_COLOURS: Record<string, number> = {
  ammo: 0xffc65c,
  gear: 0x74e39b,
  cargo: 0x63b8ff
};

/** How big a drop is drawn, in world units: a mark on the map, not an object. */
const LOOT_RADIUS = 26;
/** The slow pulse that says "this is still here", in milliseconds per cycle. */
const PULSE_MS = 1_400;

interface Drop {
  readonly glow: Phaser.GameObjects.Image;
  readonly core: Phaser.GameObjects.Image;
  /** The ring that fills while a hull stands in the circle. */
  readonly hold: Phaser.GameObjects.Graphics;
  readonly radius: number;
  readonly colour: number;
  share: number;
}

/**
 * What the field has put out, drawn as marks on the ground.
 *
 * Two baked textures per kind and nothing per frame but a position and an
 * alpha: a drop never moves, so the only thing that changes is the pulse that
 * keeps it from disappearing into the floor. The same rule as everything else
 * on this field - a fixed shape is a texture, never a drawing.
 */
export class ArenaLootLayer {
  private readonly drops = new Map<string, Drop>();
  private elapsedMs = 0;

  sync(scene: Phaser.Scene, snapshot: DisplayGameSnapshot, bake: BakeShape): void {
    const seen = new Set<string>();
    for (const drop of snapshot.arenaLoot) {
      seen.add(drop.entityId);
      const existing = this.drops.get(drop.entityId) ?? this.create(scene, drop, bake);
      this.drops.set(drop.entityId, existing);
      existing.glow.setPosition(drop.x, drop.y);
      existing.core.setPosition(drop.x, drop.y);
      if (existing.share !== drop.captureShare) {
        existing.share = drop.captureShare;
        drawHold(existing, drop.x, drop.y);
      }
    }

    for (const [id, drop] of this.drops) {
      if (seen.has(id)) continue;
      drop.glow.destroy();
      drop.core.destroy();
      drop.hold.destroy();
      this.drops.delete(id);
    }
  }

  /** One pulse for the whole field, so the marks breathe together. */
  update(deltaMs: number): void {
    if (this.drops.size === 0) return;
    this.elapsedMs = (this.elapsedMs + deltaMs) % PULSE_MS;
    const phase = (this.elapsedMs / PULSE_MS) * Math.PI * 2;
    const pulse = 0.55 + 0.25 * (1 + Math.sin(phase)) * 0.5;
    for (const drop of this.drops.values()) {
      drop.glow.setAlpha(pulse);
      drop.glow.setScale(0.9 + (pulse - 0.55) * 0.4);
    }
  }

  destroy(): void {
    for (const drop of this.drops.values()) {
      drop.glow.destroy();
      drop.core.destroy();
      drop.hold.destroy();
    }
    this.drops.clear();
  }

  private create(
    scene: Phaser.Scene,
    drop: DisplayGameSnapshot["arenaLoot"][number],
    bake: BakeShape
  ): Drop {
    const colour = LOOT_COLOURS[drop.kind] ?? LOOT_COLOURS.ammo ?? 0xffffff;
    const glowKey = bake(`arenaLootGlow:${drop.kind}`, LOOT_RADIUS + 8, (graphics) => {
      graphics.fillStyle(colour, 0.22);
      graphics.fillCircle(0, 0, LOOT_RADIUS);
      graphics.lineStyle(3, colour, 0.75);
      graphics.strokeCircle(0, 0, LOOT_RADIUS);
    });
    const coreKey = bake(`arenaLootCore:${drop.kind}`, LOOT_RADIUS * 0.5, (graphics) => {
      graphics.fillStyle(colour, 0.95);
      graphics.fillCircle(0, 0, LOOT_RADIUS * 0.34);
    });
    return {
      // Under everything that flies and over the floor: a drop is ground.
      glow: scene.add.image(drop.x, drop.y, glowKey).setDepth(2),
      core: scene.add.image(drop.x, drop.y, coreKey).setDepth(3),
      /*
       * The one drawing on this field, and it earns the exception: a ring that
       * fills is an arc whose length is different every time it changes, which
       * is the one shape a texture cannot be baked for. It is redrawn only when
       * the share moves - a few times a second while somebody is standing in
       * the circle, and never at all when nobody is.
       */
      hold: scene.add.graphics().setDepth(4),
      radius: drop.captureRadius,
      colour,
      share: -1
    };
  }
}

/**
 * The circle, and how much of the hold is served.
 *
 * One colour whatever is happening: the arc says how far the count has got, and
 * a ring that also changed colour would be two signals for one fact. The
 * animation of a capture is a separate thing and will arrive as one.
 */
function drawHold(drop: Drop, x: number, y: number): void {
  drop.hold.clear();
  drop.hold.lineStyle(4, drop.colour, 0.85);
  drop.hold.beginPath();
  drop.hold.arc(
    x,
    y,
    drop.radius,
    -Math.PI / 2,
    -Math.PI / 2 + Math.max(0.001, drop.share) * Math.PI * 2,
    false
  );
  drop.hold.strokePath();
}
