import { CatalogAssetShape } from "@spaceship-defender/client-shared";
import { getVisualAsset, type PublicShip } from "@spaceship-defender/protocol";

const BOX = 160;
const CENTER = BOX / 2;

interface ShipTileProps {
  readonly ship: PublicShip;
  readonly selected: boolean;
  /** A hull the prototype does not fly yet: shown, named, and not pickable. */
  readonly locked: boolean;
  readonly onSelect: () => void;
}

/**
 * One hull as a tile: its silhouette, its name, what it is for.
 *
 * The picture is the catalogue's own top-down art, the same geometry the run
 * draws, because a tile that showed something else would be promising a ship
 * the player is not about to fly. Illustration replaces it when there is one.
 */
export function ShipTile({ ship, selected, locked, onSelect }: ShipTileProps) {
  const asset = getVisualAsset(ship.visual?.shape ?? "");
  const radius = BOX * 0.34 * (ship.visual?.modelScale ?? 1);
  const className = ["ship-tile", selected ? "is-selected" : "", locked ? "is-locked" : ""]
    .filter((part) => part.length > 0)
    .join(" ");

  return (
    <button
      type="button"
      className={className}
      // The label is the hull's name alone: the tile also carries a silhouette
      // and a pitch, and a name stitched out of all three is one no harness or
      // screen reader can say out loud.
      aria-label={ship.label}
      aria-pressed={selected}
      disabled={locked}
      onClick={onSelect}
    >
      <span className="ship-tile__art">
        <svg
          viewBox={`0 0 ${String(BOX)} ${String(BOX)}`}
          role="img"
          aria-label={`Корпус ${ship.label}`}
        >
          <CatalogAssetShape asset={asset} radius={radius} center={CENTER} />
        </svg>
      </span>
      <span className="ship-tile__name">{ship.label}</span>
      <span className="ship-tile__pitch">{ship.description}</span>
      {locked && <span className="ship-tile__lock">Скоро</span>}
    </button>
  );
}
