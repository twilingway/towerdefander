import { PIVOT_LIMIT, type BalanceTuning } from "@spaceship-defender/protocol";

import { AssetPicker } from "../../AssetPicker.js";
import { NumberField } from "../../components/fields.js";
import { PlayerShipPreview } from "../../PlayerShipPreview.js";
import { scaleEntityVisual } from "../../model/tuning.js";

interface AppearanceCardProps {
  readonly tuning: BalanceTuning;
  readonly patch: (values: Partial<BalanceTuning>) => void;
}

/** Внешний вид корабля и точки подвеса оружия. */
export function AppearanceCard({ tuning, patch }: AppearanceCardProps) {
  return (
    <>
      <article className="card">
        <h4 className="card__subtitle">Внешний вид</h4>
        <div className="appearance">
          <PlayerShipPreview tuning={tuning} />
          <div className="appearance__controls">
            <AssetPicker
              label="Корпус"
              value={tuning.spaceshipVisual?.shape ?? null}
              categories={["ship"]}
              allowNone
              onChange={(shape) => {
                patch({
                  spaceshipVisual:
                    shape === null
                      ? null
                      : { shape, modelScale: tuning.spaceshipVisual?.modelScale ?? 1 }
                });
              }}
            />
            <div className="card__grid">
              <NumberField
                caption="Масштаб модели"
                step={0.1}
                min={0.2}
                value={tuning.spaceshipVisual?.modelScale ?? 1}
                onChange={(modelScale) => {
                  patch({ spaceshipVisual: scaleEntityVisual(tuning.spaceshipVisual, modelScale) });
                }}
              />
            </div>
            <AssetPicker
              label="Пушка на корпусе"
              value={tuning.turretVisual?.shape ?? null}
              categories={["weapon", "drone"]}
              allowNone
              onChange={(shape) => {
                patch({
                  turretVisual:
                    shape === null
                      ? null
                      : {
                          shape,
                          modelScale: tuning.turretVisual?.modelScale ?? 1,
                          mountX: tuning.turretVisual?.mountX ?? 0,
                          mountY: tuning.turretVisual?.mountY ?? 0,
                          pivotX: tuning.turretVisual?.pivotX ?? 0,
                          pivotY: tuning.turretVisual?.pivotY ?? 0
                        }
                });
              }}
            />
            <div className="card__grid">
              <NumberField
                caption="Масштаб модели"
                step={0.1}
                min={0.2}
                value={tuning.turretVisual?.modelScale ?? 1}
                onChange={(modelScale) => {
                  const current = tuning.turretVisual;
                  if (current === null) return;
                  patch({ turretVisual: { ...current, modelScale } });
                }}
              />
              <NumberField
                caption="Крепление X"
                step={0.05}
                min={-PIVOT_LIMIT}
                value={tuning.turretVisual?.mountX ?? 0}
                onChange={(mountX) => {
                  const current = tuning.turretVisual;
                  if (current === null) return;
                  patch({ turretVisual: { ...current, mountX } });
                }}
              />
              <NumberField
                caption="Крепление Y"
                step={0.05}
                min={-PIVOT_LIMIT}
                value={tuning.turretVisual?.mountY ?? 0}
                onChange={(mountY) => {
                  const current = tuning.turretVisual;
                  if (current === null) return;
                  patch({ turretVisual: { ...current, mountY } });
                }}
              />
              <NumberField
                caption="Смещение X"
                step={0.05}
                min={-PIVOT_LIMIT}
                value={tuning.turretVisual?.pivotX ?? 0}
                onChange={(pivotX) => {
                  const current = tuning.turretVisual;
                  if (current === null) return;
                  patch({ turretVisual: { ...current, pivotX } });
                }}
              />
              <NumberField
                caption="Смещение Y"
                step={0.05}
                min={-PIVOT_LIMIT}
                value={tuning.turretVisual?.pivotY ?? 0}
                onChange={(pivotY) => {
                  const current = tuning.turretVisual;
                  if (current === null) return;
                  patch({ turretVisual: { ...current, pivotY } });
                }}
              />
            </div>
            <p className="screen__hint">
              Два разных сдвига, оба в долях радиуса корпуса. Крепление — где оружие стоит на
              корабле: оно едет вместе с корпусом, поэтому пушку можно вынести на крыло. Смещение
              подгоняет сам рисунок вокруг этого крепления: ассеты нарисованы вокруг своего начала
              координат, а оно редко совпадает с казёнником. Ноль у обоих — как было раньше, по
              центру. В превью точка показывает крепление.
            </p>
            <AssetPicker
              label="Снаряд пушки"
              value={tuning.projectileVisual?.shape ?? null}
              categories={["missile", "weapon"]}
              allowNone
              onChange={(shape) => {
                patch({
                  projectileVisual:
                    shape === null
                      ? null
                      : { shape, modelScale: tuning.projectileVisual?.modelScale ?? 1 }
                });
              }}
            />
            <div className="card__grid">
              <NumberField
                caption="Масштаб модели"
                step={0.1}
                min={0.2}
                value={tuning.projectileVisual?.modelScale ?? 1}
                onChange={(modelScale) => {
                  patch({
                    projectileVisual: scaleEntityVisual(tuning.projectileVisual, modelScale)
                  });
                }}
              />
            </div>
            <p className="screen__hint">
              Внешний вид выстрела орудия наводчика. Без выбора — точка по умолчанию.
            </p>
            <AssetPicker
              label="Снаряд пулемёта"
              value={tuning.mgProjectileVisual?.shape ?? null}
              categories={["missile", "weapon"]}
              allowNone
              onChange={(shape) => {
                patch({
                  mgProjectileVisual:
                    shape === null
                      ? null
                      : { shape, modelScale: tuning.mgProjectileVisual?.modelScale ?? 1 }
                });
              }}
            />
            <div className="card__grid">
              <NumberField
                caption="Масштаб модели"
                step={0.1}
                min={0.2}
                value={tuning.mgProjectileVisual?.modelScale ?? 1}
                onChange={(modelScale) => {
                  patch({
                    mgProjectileVisual: scaleEntityVisual(tuning.mgProjectileVisual, modelScale)
                  });
                }}
              />
            </div>
            <p className="screen__hint">
              Внешний вид выстрела носового пулемёта; отличайте его от снаряда пушки, чтобы очередь
              читалась.
            </p>
            <p className="screen__hint">
              Без выбора корабль рисуется силуэтом по умолчанию. Масштаб меняет только рисунок,
              радиус поражения остаётся своим.
            </p>
          </div>
        </div>
      </article>
    </>
  );
}
