import type { EnemyArchetype } from "@spaceship-defender/protocol";

import {
  SPACESHIP_WORLD_RADIUS,
  modelWorldRadius,
  previewScale,
  shapeDrawing,
  toSvgPoints
} from "./enemyShapes.js";

const BOX = 148;
const CENTER = BOX / 2;

export interface EnemyPreviewProps {
  readonly archetype: EnemyArchetype;
}

/** Shows the drawn model against the hit radius it will really be shot at. */
export function EnemyPreview({ archetype }: EnemyPreviewProps) {
  const { visual } = archetype;
  const scale = previewScale(archetype.radius, visual.modelScale, visual.shape, BOX);
  const hitRadius = archetype.radius * scale.factor;
  const modelRadius = hitRadius * visual.modelScale;
  const drawing = shapeDrawing(visual.shape, modelRadius);
  const barWidth = modelRadius * 1.8;
  const barHeight = Math.max(3, modelRadius * 0.12);
  const barTop = CENTER - modelRadius - barHeight * 2.4;

  return (
    <figure className="preview">
      <svg
        className="preview__canvas"
        viewBox={`0 0 ${String(BOX)} ${String(BOX)}`}
        role="img"
        aria-label={`Внешний вид: ${archetype.label}`}
      >
        <circle
          className="preview__reference"
          cx={CENTER}
          cy={CENTER}
          r={SPACESHIP_WORLD_RADIUS * scale.factor}
        />
        {drawing.polygon.length > 0 ? (
          <polygon
            points={toSvgPoints(drawing.polygon, CENTER)}
            fill={visual.color}
            fillOpacity={0.85}
            stroke={visual.outline}
            strokeWidth={2.5}
            strokeLinejoin="round"
          />
        ) : null}
        {drawing.circles.map((ring, index) => (
          <circle
            key={`ring-${String(index)}`}
            cx={CENTER}
            cy={CENTER}
            r={ring.radius}
            fill={ring.filled ? visual.color : "none"}
            stroke={visual.outline}
            strokeWidth={2}
          />
        ))}
        <circle className="preview__hitbox" cx={CENTER} cy={CENTER} r={hitRadius} />
        <text className="preview__tag preview__tag--hit" x={CENTER + 3} y={CENTER - hitRadius - 3}>
          поражение {archetype.radius}
        </text>
        <text
          className="preview__tag preview__tag--ship"
          x={CENTER + 3}
          y={CENTER - SPACESHIP_WORLD_RADIUS * scale.factor - 3}
        >
          корабль {SPACESHIP_WORLD_RADIUS}
        </text>
        {visual.showHealthBar ? (
          <g>
            <rect
              x={CENTER - barWidth / 2}
              y={barTop}
              width={barWidth}
              height={barHeight}
              fill="#2a0d16"
              stroke={visual.outline}
              strokeWidth={1.5}
            />
            <rect
              x={CENTER - barWidth / 2}
              y={barTop}
              width={barWidth * 0.65}
              height={barHeight}
              fill="#ff5f7a"
            />
          </g>
        ) : null}
      </svg>
      <figcaption className="preview__caption">
        <span className="preview__row preview__row--hit">сплошной круг — по нему бьют снаряды</span>
        <span className="preview__row preview__row--model">
          модель {modelWorldRadius(archetype.radius, visual.modelScale)}
          {scale.modelOverflows ? " (шире кадра)" : ""}
        </span>
        <span className="preview__key">пунктир — корпус корабля, только для сравнения</span>
      </figcaption>
    </figure>
  );
}
