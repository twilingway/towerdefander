import type { DisplayRoomView } from "@spaceship-defender/protocol";

import { BossHealth } from "./BossHealth.js";
import { CrewLatency } from "../../components/CrewLatency/index.js";
import { getCurrentWaveUpgrade, selectBoss } from "../../model/combatHudViewModel.js";
import { roleLabel } from "@spaceship-defender/client-shared";
import { encounterLabel } from "../../model/labels.js";
import { ModuleTreeWindow, type ModuleTreeEntry } from "../../components/ModuleTreeWindow/index.js";
import { SoloCockpit, type SoloCockpitProps } from "./SoloCockpit/index.js";
import { SalvageCountdown } from "./SalvageCountdown.js";
import { useWorldSlice } from "../../model/worldStore.js";
import { WaveCountdown } from "./WaveCountdown.js";
import { WeaponHeat } from "./WeaponHeat.js";

/**
 * The battle panels, each subscribed to the one slice it draws.
 *
 * Before this, a patch replaced the view in React state and the whole page
 * re-rendered: measured against the reference stand on the same throttled
 * machine, that was ten commits a second of up to nine milliseconds each, and a
 * commit that long does not fit in a frame. The reference stand runs four times
 * more React than we do without dropping a frame, because every one of its
 * panels re-renders itself and nothing else.
 *
 * The shape here is that, with one deliberate compromise. Each panel selects
 * the whole game snapshot but supplies an equality that lists exactly the
 * fields it reads, so it wakes only when those move. Passing the snapshot
 * through keeps the presentational components untouched - their props stay pure
 * and their tests keep rendering to static markup - at the price of one rule:
 * when a panel starts reading a new field, that field goes into its comparison
 * in the same edit, or the panel will quietly show a stale one.
 */

type Game = NonNullable<DisplayRoomView["game"]>;

/** Only wave rocks pay credits, so those are the ones the header counts. */
function waveAsteroidCount(game: Game): number {
  let count = 0;
  for (const asteroid of game.asteroids) {
    if (asteroid.origin === "wave") count += 1;
  }
  return count;
}

const gameOf = (view: DisplayRoomView | undefined): Game | null => view?.game ?? null;

/**
 * Both live, or nothing to compare.
 *
 * A pair rather than a type guard because a guard narrows only the argument it
 * names, and every comparison below needs both sides narrowed at once.
 */
function pair(left: Game | null, right: Game | null): readonly [Game, Game] | undefined {
  return left !== null && right !== null ? [left, right] : undefined;
}

function sameHeader(left: Game | null, right: Game | null): boolean {
  if (left === right) return true;
  const both = pair(left, right);
  if (both === undefined) return false;
  const [held, next] = both;
  const upgrade = getCurrentWaveUpgrade(held.teamUpgrade.selection, held.encounter.waveNumber);
  const nextUpgrade = getCurrentWaveUpgrade(next.teamUpgrade.selection, next.encounter.waveNumber);
  return (
    held.encounter.waveNumber === next.encounter.waveNumber &&
    held.encounter.phase === next.encounter.phase &&
    held.encounter.score === next.encounter.score &&
    held.enemyShips.length === next.enemyShips.length &&
    held.homingMissiles.length === next.homingMissiles.length &&
    waveAsteroidCount(held) === waveAsteroidCount(next) &&
    held.credits === next.credits &&
    (upgrade?.role ?? null) === (nextUpgrade?.role ?? null)
  );
}

/**
 * The two bars, drawn once and moved by hand afterwards.
 *
 * Nothing subscribes here: `useLiveHeat` writes the fill, the label and the
 * attributes straight to these nodes twenty times a second, so a held trigger
 * never re-renders anything. The snapshot below is only what the gauges are
 * built from - the capacity decides the shape of the meter, and it is bought,
 * not fired.
 */
function WeaponHeatPanel() {
  const game = useWorldSlice(gameOf, sameCapacities);
  if (game === null) return null;
  return <WeaponHeat cannon={game.cannon} machineGun={game.machineGun} />;
}

/** What a gauge is built from, as opposed to what it shows. */
function sameCapacities(left: Game | null, right: Game | null): boolean {
  if (left === right) return true;
  const both = pair(left, right);
  if (both === undefined) return false;
  const [held, next] = both;
  return (
    held.cannon.capacity === next.cannon.capacity &&
    held.machineGun.capacity === next.machineGun.capacity
  );
}

export function BattleHudPanel() {
  const game = useWorldSlice(gameOf, sameHeader);
  if (game === null) return null;
  const upgrade = getCurrentWaveUpgrade(game.teamUpgrade.selection, game.encounter.waveNumber);
  return (
    <header className="battle-header spaceship-hud">
      <div>
        <span>Волна</span>
        <strong>{game.encounter.waveNumber}</strong>
        <small>{encounterLabel(game.encounter.phase)}</small>
      </div>
      {/* Hull and shield moved onto the radar dial: two rings, their end labels
        and the shield state word say everything these two cards did, in the
        place the pilot is already looking. */}
      <div>
        <span>Счёт</span>
        <strong>{game.encounter.score}</strong>
        <small data-testid="hud-field-counts">
          Враги {game.enemyShips.length} · Ракеты {game.homingMissiles.length} · Камни{" "}
          {waveAsteroidCount(game)}
        </small>
      </div>
      <div>
        <span>Кредиты</span>
        <strong>{game.credits}</strong>
        <small>
          {upgrade === null
            ? "в этой волне улучшений нет"
            : `улучшение волны: ${roleLabel(upgrade.role)}`}
        </small>
      </div>
      <WeaponHeatPanel />
    </header>
  );
}

function sameCountdown(left: Game | null, right: Game | null): boolean {
  if (left === right) return true;
  const both = pair(left, right);
  if (both === undefined) return false;
  const [held, next] = both;
  return (
    held.encounter.phase === next.encounter.phase &&
    held.encounter.lootWindowSecondsRemaining === next.encounter.lootWindowSecondsRemaining &&
    held.encounter.waveSecondsRemaining === next.encounter.waveSecondsRemaining
  );
}

export function CountdownPanel() {
  const game = useWorldSlice(gameOf, sameCountdown);
  if (game?.encounter.phase !== "combat") return null;
  return game.encounter.lootWindowSecondsRemaining > 0 ? (
    <SalvageCountdown secondsRemaining={game.encounter.lootWindowSecondsRemaining} />
  ) : (
    <WaveCountdown
      className="display-wave-countdown"
      secondsRemaining={game.encounter.waveSecondsRemaining}
    />
  );
}

function sameBoss(left: Game | null, right: Game | null): boolean {
  if (left === right) return true;
  const both = pair(left, right);
  if (both === undefined) return false;
  const [held, next] = both;
  if (held.encounter.phase !== next.encounter.phase) return false;
  const boss = selectBoss(held);
  const nextBoss = selectBoss(next);
  if (boss === undefined || nextBoss === undefined) return boss === nextBoss;
  return (
    boss.entityId === nextBoss.entityId && boss.hp === nextBoss.hp && boss.maxHp === nextBoss.maxHp
  );
}

export function BossPanel() {
  const game = useWorldSlice(gameOf, sameBoss);
  if (game?.encounter.phase !== "combat") return null;
  return <BossHealth game={game} />;
}

function samePurchases(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function sameCrew(left: DisplayRoomView | undefined, right: DisplayRoomView | undefined): boolean {
  if (left === right) return true;
  if (left === undefined || right === undefined) return false;
  if (left.displayLatencyMs !== right.displayLatencyMs) return false;
  if (left.players.length !== right.players.length) return false;
  for (let index = 0; index < left.players.length; index += 1) {
    const player = left.players[index];
    const next = right.players[index];
    if (
      player?.role !== next?.role ||
      player?.connected !== next?.connected ||
      player?.latencyMs !== next?.latencyMs
    ) {
      return false;
    }
  }
  const purchases = left.game?.purchasedModules ?? [];
  const nextPurchases = right.game?.purchasedModules ?? [];
  return samePurchases(purchases, nextPurchases);
}

export function CrewLatencyPanel() {
  const view = useWorldSlice((held) => held, sameCrew);
  if (view?.game == null) return null;
  return <CrewLatency view={view} game={view.game} />;
}

/**
 * What the module window reads out of the run: the hull it was bought for and
 * the list of what is already on it.
 */
function sameModules(left: Game | null, right: Game | null): boolean {
  if (left === right) return true;
  const both = pair(left, right);
  if (both === undefined) return false;
  const [held, next] = both;
  return (
    held.spaceship.maxHp === next.spaceship.maxHp &&
    held.shield.capacity === next.shield.capacity &&
    held.shield.arcHalfAngle === next.shield.arcHalfAngle &&
    held.shieldRadius === next.shieldRadius &&
    samePurchases(held.purchasedModules, next.purchasedModules)
  );
}

export function ModuleWindowPanel({
  tiers,
  endlessTier,
  initiallyShown
}: {
  readonly tiers: readonly (readonly ModuleTreeEntry[])[];
  readonly endlessTier: readonly ModuleTreeEntry[];
  readonly initiallyShown: boolean;
}) {
  const game = useWorldSlice(gameOf, sameModules);
  if (game === null) return null;
  return (
    <ModuleTreeWindow
      tiers={tiers}
      endlessTier={endlessTier}
      purchased={game.purchasedModules}
      initiallyShown={initiallyShown}
      ship={{
        maxHp: game.spaceship.maxHp,
        shieldCapacity: game.shield.capacity,
        shieldArcRadians: game.shield.arcHalfAngle * 2,
        shieldRadius: game.shieldRadius
      }}
    />
  );
}

/** The numbers the cockpit's own controls are drawn from. */
function sameCockpit(left: Game | null, right: Game | null): boolean {
  if (left === right) return true;
  const both = pair(left, right);
  if (both === undefined) return false;
  const [held, next] = both;
  return (
    held.encounter.phase === next.encounter.phase &&
    held.helm.driveDeadzoneShare === next.helm.driveDeadzoneShare &&
    held.helm.aimDeadzoneShare === next.helm.aimDeadzoneShare &&
    held.machineGun.capacity === next.machineGun.capacity &&
    held.cannon.capacity === next.cannon.capacity
  );
}

/**
 * The cockpit's own subscription.
 *
 * Its controls come from the page - they are the wire half, and they outlive
 * any one patch - while the four numbers it draws come from here, so a patch
 * that only moved a rock leaves the sticks alone.
 */
export function CockpitPanel({
  controls,
  aimAssist,
  onAimAssistChange
}: {
  readonly controls: Omit<
    SoloCockpitProps,
    | "enabled"
    | "driveDeadzoneShare"
    | "aimDeadzoneShare"
    | "machineGunHeat"
    | "machineGunOverheated"
    | "cannonHeat"
    | "cannonOverheated"
    | "aimAssist"
    | "onAimAssistChange"
  >;
  readonly aimAssist: boolean;
  readonly onAimAssistChange: (enabled: boolean) => void;
}) {
  const game = useWorldSlice(gameOf, sameCockpit);
  if (game === null) return null;
  return (
    <SoloCockpit
      enabled={game.encounter.phase === "combat"}
      driveDeadzoneShare={game.helm.driveDeadzoneShare}
      aimDeadzoneShare={game.helm.aimDeadzoneShare}
      machineGunHeat={game.machineGun.heat / game.machineGun.capacity}
      machineGunOverheated={game.machineGun.overheated}
      cannonHeat={game.cannon.heat / game.cannon.capacity}
      cannonOverheated={game.cannon.overheated}
      aimAssist={aimAssist}
      onAimAssistChange={onAimAssistChange}
      {...controls}
    />
  );
}
