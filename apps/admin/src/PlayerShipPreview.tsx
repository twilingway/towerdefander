import { getVisualAsset, type BalanceTuning } from "@spaceship-defender/protocol";

import { CatalogAssetShape } from "./catalogSvg.js";
import { DEFAULT_SPACESHIP_HULL_ASSET_ID, modelWorldRadius } from "./enemyShapes.js";

const BOX = 148;
const CENTER = BOX / 2;
const FULL_CIRCLE = Math.PI * 2;

export interface PlayerShipPreviewProps {
  readonly tuning: BalanceTuning;
}

/**
 * The hull against the two circles that decide how it plays: the radius enemies
 * shoot at, and the shield sector at the radius it really intercepts at. The
 * view scale follows those two, never the model scale, so the rings stay put
 * while the silhouette grows around them.
 */
export function PlayerShipPreview({ tuning }: PlayerShipPreviewProps) {
  const visual = tuning.spaceshipVisual;
  const asset = getVisualAsset(visual?.shape ?? DEFAULT_SPACESHIP_HULL_ASSET_ID);
  const anchor = Math.max(tuning.shieldRadius, tuning.spaceshipRadius, 1) * 1.2;
  const factor = (BOX * 0.46) / anchor;
  const hullRadius = tuning.spaceshipRadius * factor;
  const shieldRadius = tuning.shieldRadius * factor;
  const modelRadius = hullRadius * (visual?.modelScale ?? 1);
  // The gun sits on the hull in the game, so it has to sit on it here too:
  // picking one and seeing nothing change is indistinguishable from a bug.
  const turret = tuning.turretVisual;
  const turretAsset = turret === null ? undefined : getVisualAsset(turret.shape);
  const turretRadius = hullRadius * (turret?.modelScale ?? 1);

  return (
    <figure className="preview">
      <svg
        className="preview__canvas"
        viewBox={`0 0 ${String(BOX)} ${String(BOX)}`}
        role="img"
        aria-label={
          turretAsset === undefined
            ? `Корпус игрока: ${asset.name}`
            : `Корпус игрока: ${asset.name}, орудие: ${turretAsset.name}`
        }
      >
        <CatalogAssetShape asset={asset} radius={modelRadius} center={CENTER} />
        {turretAsset !== undefined && (
          <CatalogAssetShape asset={turretAsset} radius={turretRadius} center={CENTER} />
        )}
        <circle className="preview__hitbox" cx={CENTER} cy={CENTER} r={hullRadius} />
        <path
          className="preview__shield"
          d={shieldArcPath(shieldRadius, tuning.shieldArcRadians)}
        />
        <text className="preview__tag preview__tag--hit" x={4} y={12}>
          ● корпус {Math.round(tuning.spaceshipRadius)}
        </text>
        <text className="preview__tag preview__tag--ship" x={4} y={BOX - 5}>
          ◜ щит {Math.round(tuning.shieldRadius)}
        </text>
      </svg>
      <figcaption className="preview__caption">
        <span className="preview__row preview__row--hit">сплошной круг — по нему бьют враги</span>
        <span className="preview__row preview__row--model">
          модель {modelWorldRadius(tuning.spaceshipRadius, visual?.modelScale ?? 1)}
        </span>
        {turretAsset !== undefined && (
          <span className="preview__row preview__row--model">орудие {turretAsset.name}</span>
        )}
        <span className="preview__key">дуга — сектор щита на его собственном радиусе</span>
      </figcaption>
    </figure>
  );
}

/** Nose points along +X here, as it does in game, so the sector reads the same way. */
function shieldArcPath(radius: number, arcRadians: number): string {
  const half = Math.min(arcRadians, FULL_CIRCLE) / 2;
  if (half * 2 >= FULL_CIRCLE - 1e-6) {
    // A sweep of a full turn degenerates to a zero-length arc, so close it manually.
    return [
      `M ${String(CENTER + radius)} ${String(CENTER)}`,
      `A ${String(radius)} ${String(radius)} 0 1 1 ${String(CENTER - radius)} ${String(CENTER)}`,
      `A ${String(radius)} ${String(radius)} 0 1 1 ${String(CENTER + radius)} ${String(CENTER)}`
    ].join(" ");
  }
  const startX = CENTER + Math.cos(-half) * radius;
  const startY = CENTER + Math.sin(-half) * radius;
  const endX = CENTER + Math.cos(half) * radius;
  const endY = CENTER + Math.sin(half) * radius;
  const largeArc = half * 2 > Math.PI ? 1 : 0;
  return `M ${String(startX)} ${String(startY)} A ${String(radius)} ${String(radius)} 0 ${String(largeArc)} 1 ${String(endX)} ${String(endY)}`;
}
