import { useMemo, useState } from "react";
import {
  VISUAL_ASSETS,
  VISUAL_ASSET_CATEGORIES,
  getVisualAsset,
  type VisualAssetCategory,
  type VisualAssetId
} from "@spaceship-defender/protocol";

import { CatalogAssetShape } from "./catalogSvg.js";

const CATEGORY_LABELS: Record<VisualAssetCategory, string> = {
  ship: "Корабли",
  station: "Станции",
  drone: "Дроны",
  missile: "Ракеты",
  weapon: "Турели",
  boss: "Боссы"
};

const THUMB_BOX = 64;

function AssetThumb({ shape }: { readonly shape: VisualAssetId }) {
  const asset = getVisualAsset(shape);
  return (
    <svg
      className="asset__thumb"
      viewBox={`0 0 ${String(THUMB_BOX)} ${String(THUMB_BOX)}`}
      aria-hidden="true"
    >
      <CatalogAssetShape asset={asset} radius={THUMB_BOX * 0.4} center={THUMB_BOX / 2} />
    </svg>
  );
}

export interface AssetPickerProps {
  readonly label: string;
  /** Null is only reachable when `allowNone`; it means "display default look". */
  readonly value: VisualAssetId | null;
  readonly onChange: (shape: VisualAssetId | null) => void;
  /** Categories offered first; the rest stay reachable through "Все". */
  readonly categories: readonly VisualAssetCategory[];
  readonly allowNone?: boolean;
}

/**
 * Browses the shared visual catalogue. Seventy silhouettes do not fit a chip row,
 * so the grid lives inside a `details` and stays collapsed until an operator
 * goes looking for it.
 */
export function AssetPicker({
  label,
  value,
  onChange,
  categories,
  allowNone = false
}: AssetPickerProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<VisualAssetCategory | "all">(categories[0] ?? "all");

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return VISUAL_ASSETS.filter((asset) => {
      if (category !== "all" && asset.category !== category) return false;
      if (needle.length === 0) return true;
      return `${asset.name} ${asset.id} ${asset.role}`.toLowerCase().includes(needle);
    });
  }, [query, category]);

  const selected = value === null ? null : getVisualAsset(value);

  return (
    <details className="assets">
      <summary className="assets__summary">
        <span className="assets__caption">{label}</span>
        <span className="assets__current">
          {selected === null ? "по умолчанию" : `${selected.name} · ${selected.id}`}
        </span>
      </summary>

      <div className="assets__controls">
        <input
          className="field__input assets__search"
          type="search"
          value={query}
          placeholder="Поиск: лансер, дрон, ракета…"
          aria-label={`${label}: поиск`}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
        <div className="sectors" role="group" aria-label={`${label}: категория`}>
          <button
            type="button"
            className={`sectors__chip${category === "all" ? " sectors__chip--on" : ""}`}
            aria-pressed={category === "all"}
            onClick={() => {
              setCategory("all");
            }}
          >
            Все
          </button>
          {VISUAL_ASSET_CATEGORIES.map((option) => (
            <button
              key={option}
              type="button"
              className={`sectors__chip${category === option ? " sectors__chip--on" : ""}`}
              aria-pressed={category === option}
              onClick={() => {
                setCategory(option);
              }}
            >
              {CATEGORY_LABELS[option]}
            </button>
          ))}
        </div>
      </div>

      <div className="assets__grid">
        {allowNone ? (
          <button
            type="button"
            className={`asset${value === null ? " asset--on" : ""}`}
            aria-pressed={value === null}
            onClick={() => {
              onChange(null);
            }}
          >
            <span className="asset__none">по умолчанию</span>
            <span className="asset__name">без силуэта</span>
          </button>
        ) : null}
        {matches.map((asset) => (
          <button
            key={asset.id}
            type="button"
            className={`asset${value === asset.id ? " asset--on" : ""}`}
            aria-pressed={value === asset.id}
            title={`${asset.id}${asset.role.length > 0 ? ` · ${asset.role}` : ""}`}
            onClick={() => {
              onChange(asset.id);
            }}
          >
            <AssetThumb shape={asset.id} />
            <span className="asset__name">{asset.name}</span>
          </button>
        ))}
        {matches.length === 0 ? <p className="assets__empty">Ничего не найдено</p> : null}
      </div>
    </details>
  );
}
