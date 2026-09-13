import type { DisplayRoomView } from "@spaceship-defender/protocol";

import { useRef } from "react";

import { ARENA_SHIP_COUNT } from "@spaceship-defender/game-core";

import { ArenaHud } from "./ArenaHud.js";
import { BossHealth } from "./BossHealth.js";
import { CrewLatency } from "../../components/CrewLatency/index.js";
import { getCurrentWaveUpgrade, selectBoss } from "../../model/combatHudViewModel.js";
import { roleLabel } from "@spaceship-defender/client-shared";
import { encounterLabel } from "../../model/labels.js";
import { ModuleTreeWindow, type ModuleTreeEntry } from "../../components/ModuleTreeWindow/index.js";
import { SoloCockpit, type SoloCockpitProps } from "./SoloCockpit/index.js";
import { SalvageCountdown } from "./SalvageCountdown.js";
import { useWorldSlice } from "../../model/worldStore.js";
import { hudFrameUrl } from "../../model/hudFrames.js";
import {
  readScanReading,
  readStatusReading,
  sameScanReading,
  sameStatusReading,
  type ScanReading,
  type StatusReading
} from "../../model/statusFrame.js";
import { InfoFrame } from "./InfoFrame.js";
import { ScanFrame } from "./ScanFrame.js";
import { StatusFrame } from "./StatusFrame.js";
import { TimerFrame } from "./TimerFrame.js";
import { formatWaveCountdown, WAVE_WARNING_SECONDS, WaveCountdown } from "./WaveCountdown.js";
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
        <small data-testid="hud-field-counts">{fieldCounts(game)}</small>
      </div>
      <div>
        <span>Кредиты</span>
        <strong>{game.credits}</strong>
        <small>{upgradeLine(game)}</small>
      </div>
      <WeaponHeatPanel />
    </header>
  );
}

/**
 * Everything the match head-up display reads, and nothing else.
 *
 * The rule this file states at the top, kept: a panel wakes on the fields it
 * draws. A match moves all of these constantly, so this one wakes on nearly
 * every patch - which is what it is for.
 */
function sameArenaHeader(left: Game | null, right: Game | null): boolean {
  if (left === right) return true;
  const both = pair(left, right);
  if (both === undefined) return false;
  const [held, next] = both;
  return (
    held.arenaShips.length === next.arenaShips.length &&
    held.arenaShips.filter((ship) => ship.alive).length ===
      next.arenaShips.filter((ship) => ship.alive).length &&
    held.encounter.score === next.encounter.score &&
    held.spaceship.hp === next.spaceship.hp &&
    held.spaceship.maxHp === next.spaceship.maxHp &&
    held.shield.energy === next.shield.energy &&
    held.shield.capacity === next.shield.capacity &&
    held.shield.active === next.shield.active &&
    held.cannon.heat === next.cannon.heat &&
    held.cannon.capacity === next.cannon.capacity &&
    held.cannon.overheated === next.cannon.overheated &&
    held.machineGun.heat === next.machineGun.heat &&
    held.machineGun.capacity === next.machineGun.capacity &&
    held.machineGun.overheated === next.machineGun.overheated &&
    held.scanReadySeconds === next.scanReadySeconds &&
    held.scanRevealSecondsRemaining === next.scanRevealSecondsRemaining
  );
}

export function ArenaHudPanel({ onScan }: { readonly onScan: () => void }) {
  const game = useWorldSlice(gameOf, sameArenaHeader);
  const { alive, place } = useArenaStanding(game);
  if (game === null) return null;
  return (
    <ArenaHud
      alive={alive}
      fieldSize={ARENA_SHIP_COUNT}
      kills={game.encounter.score}
      place={place}
      hp={game.spaceship.hp}
      maxHp={game.spaceship.maxHp}
      shield={game.shield.energy}
      shieldCapacity={game.shield.capacity}
      shieldActive={game.shield.active}
      cannon={game.cannon}
      machineGun={game.machineGun}
      scanReadySeconds={game.scanReadySeconds}
      scanRevealSecondsRemaining={game.scanRevealSecondsRemaining}
      onScan={onScan}
    />
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

/** The field's small line, in both skins' words. */
function fieldCounts(game: Game): string {
  return `Враги ${String(game.enemyShips.length)} · Ракеты ${String(game.homingMissiles.length)} · Камни ${String(waveAsteroidCount(game))}`;
}

/** What this wave's team upgrade is, if the crew paid for one. */
function upgradeLine(game: Game): string {
  const upgrade = getCurrentWaveUpgrade(game.teamUpgrade.selection, game.encounter.waveNumber);
  return upgrade === null
    ? "в этой волне улучшений нет"
    : `улучшение волны: ${roleLabel(upgrade.role)}`;
}

/**
 * How many are still up, and where this pilot stands.
 *
 * The place stops moving when this hull does. While a pilot is flying, the place
 * they would take by falling now is simply how many ships are up - and the moment
 * theirs is gone the room stops publishing it, so the last number held is the
 * place they actually took. Kept rather than recomputed for the same reason:
 * after the wreck there is nothing left to compute it from.
 */
function useArenaStanding(game: Game | null): { readonly alive: number; readonly place: number } {
  const place = useRef(ARENA_SHIP_COUNT);
  if (game === null) return { alive: 0, place: place.current };
  // Wrecks stay on the wire long enough to be seen dying, so "alive" has to
  // count the ones still flying rather than the ones still published.
  const alive = game.arenaShips.filter((ship) => ship.alive).length;
  if (game.arenaShips.some((ship) => ship.isSelf && ship.alive)) place.current = alive;
  return { alive, place: place.current };
}

const statusReadingOf = (view: DisplayRoomView | undefined): StatusReading | null => {
  const game = view?.game;
  return game == null ? null : readStatusReading(game);
};

/** The frame skin's status panel: wakes only when a bar's lit count or state changes. */
export function StatusFramePanel() {
  const reading = useWorldSlice(statusReadingOf, sameStatusReading);
  if (reading === null) return null;
  return <StatusFrame reading={reading} frameUrl={hudFrameUrl("ui-status")} />;
}

const scanReadingOf = (view: DisplayRoomView | undefined): ScanReading | null => {
  const game = view?.game;
  return game == null ? null : readScanReading(game);
};

/** The frame skin's sweep: a match only, waking when either of its clocks ticks. */
export function ScanFramePanel({ onScan }: { readonly onScan: () => void }) {
  const scan = useWorldSlice(scanReadingOf, sameScanReading);
  if (scan === null) return null;
  return (
    <ScanFrame
      readySeconds={scan.readySeconds}
      revealSecondsRemaining={scan.revealSecondsRemaining}
      onScan={onScan}
    />
  );
}

/** The frame skin's campaign header: the classic header's three numbers in the example's frame. */
export function InfoFramePanel() {
  const game = useWorldSlice(gameOf, sameHeader);
  if (game === null) return null;
  return (
    <InfoFrame
      frameUrl={hudFrameUrl("ui-info")}
      rows={[
        {
          label: "Волна",
          value: game.encounter.waveNumber,
          detail: encounterLabel(game.encounter.phase)
        },
        {
          label: "Счёт",
          value: game.encounter.score,
          detail: fieldCounts(game),
          detailTestId: "hud-field-counts"
        },
        { label: "Кредиты", value: game.credits, detail: upgradeLine(game) }
      ]}
    />
  );
}

function sameArenaStanding(left: Game | null, right: Game | null): boolean {
  if (left === right) return true;
  const both = pair(left, right);
  if (both === undefined) return false;
  const [held, next] = both;
  const flying = (game: Game) => game.arenaShips.some((ship) => ship.isSelf && ship.alive);
  return (
    held.arenaShips.length === next.arenaShips.length &&
    held.arenaShips.filter((ship) => ship.alive).length ===
      next.arenaShips.filter((ship) => ship.alive).length &&
    flying(held) === flying(next) &&
    held.encounter.score === next.encounter.score
  );
}

/** The frame skin's match header: who is left, who fell to this pilot, where they stand. */
export function ArenaInfoFramePanel() {
  const game = useWorldSlice(gameOf, sameArenaStanding);
  const { alive, place } = useArenaStanding(game);
  if (game === null) return null;
  return (
    <InfoFrame
      frameUrl={hudFrameUrl("ui-info")}
      rows={[
        {
          label: "Живых",
          value: (
            <>
              {alive}
              <small>/{ARENA_SHIP_COUNT}</small>
            </>
          )
        },
        { label: "Сбитые", value: game.encounter.score, valueTestId: "arena-hud-kills" },
        { label: "Место", value: place, valueTestId: "arena-hud-place" }
      ]}
    />
  );
}

/**
 * The frame skin's clock: the wave's deadline, or the loot window once the wave
 * is won. A match has no wave, so there it is the bare time.
 */
export function TimerFramePanel() {
  const game = useWorldSlice(gameOf, sameCountdown);
  if (game?.encounter.phase !== "combat") return null;
  const frameUrl = hudFrameUrl("ui-timer");
  const salvage = game.encounter.lootWindowSecondsRemaining;
  if (salvage > 0) {
    const seconds = String(Math.max(0, Math.ceil(salvage)));
    return (
      <TimerFrame
        value={seconds}
        caption="Сбор трофеев"
        ariaLabel={`Сбор трофеев ${seconds} с`}
        tone="salvage"
        frameUrl={frameUrl}
      />
    );
  }
  const remaining = game.encounter.waveSecondsRemaining;
  const clock = formatWaveCountdown(remaining);
  const match = game.arenaShips.length > 0;
  return (
    <TimerFrame
      value={clock}
      caption={match ? undefined : "До конца волны"}
      ariaLabel={match ? `Осталось ${clock}` : `До конца волны ${clock}`}
      tone={remaining <= WAVE_WARNING_SECONDS ? "warning" : "wave"}
      frameUrl={frameUrl}
    />
  );
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
  controls
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
  >;
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
      {...controls}
    />
  );
}
