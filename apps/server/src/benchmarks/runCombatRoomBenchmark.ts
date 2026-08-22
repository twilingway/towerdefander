import { Decoder, Encoder, StateView } from "@colyseus/schema";
import {
  advanceFlyingCastle,
  createFlyingCastleConfig,
  dynamicEntityCount,
  type FlyingCastleState
} from "@town-defenders/game-core";
import { cpus, freemem, platform, release, totalmem } from "node:os";

import {
  AsteroidState,
  EnemyState,
  HomingMissileState,
  ProjectileState,
  TownDefendersState
} from "../rooms/TownDefendersState.js";
import { createWorstCaseCombatFixture } from "./worstCaseCombat.js";

const WARMUP_SAMPLES = 250;
const MEASURED_SAMPLES = 2_000;
Encoder.BUFFER_SIZE = 32 * 1024;

const config = createFlyingCastleConfig();
const fixture = createWorstCaseCombatFixture(config);
const stepped = advanceFlyingCastle(fixture, config);
const schema = hydrateSchema(fixture);
const encoder = new Encoder(schema);
const displayView = new StateView();
displayView.add(schema.game, 1);
const decoderState = new TownDefendersState();
const decoder = new Decoder(decoderState);
const fullPatch = encodeAllForView(encoder, displayView);
decoder.decode(fullPatch);
encoder.discardChanges();

schema.game.tick += 1;
const latencyOnlyPatch = encodeChangesForView(encoder, displayView);
decoder.decode(latencyOnlyPatch);
encoder.discardChanges();

hydrateDynamicEntities(schema, stepped);
schema.game.tick = stepped.clock.tick;
const movingPatch = encodeChangesForView(encoder, displayView);
decoder.decode(movingPatch);
encoder.discardChanges();

for (let index = 0; index < WARMUP_SAMPLES; index += 1) {
  advanceFlyingCastle(fixture, config);
}
const stepDurationsMs = measureSamples(() => {
  advanceFlyingCastle(fixture, config);
});
const syncDurationsMs = measureSamples(() => {
  hydrateDynamicEntities(schema, indexParityState(fixture, stepped, schema.game.tick));
  schema.game.tick += 1;
});
const roomStepDurationsMs = measureRoomStepSamples();

const cpu = cpus()[0];
const result = {
  benchmark: "tyrian-combat-196-entities",
  measuredAt: new Date().toISOString(),
  runtime: {
    node: process.version,
    platform: `${platform()} ${release()} ${process.arch}`,
    cpu: cpu?.model.trim() ?? "unknown",
    logicalCpus: cpus().length,
    memoryGiB: round(totalmem() / 1024 ** 3, 2),
    freeMemoryGiBAtStart: round(freemem() / 1024 ** 3, 2)
  },
  fixture: {
    dynamicEntities: dynamicEntityCount(fixture),
    enemyShips: fixture.enemies.length,
    asteroids: fixture.asteroids.length,
    hostileProjectiles: fixture.hostileProjectiles.length,
    homingMissiles: fixture.homingMissiles.length,
    friendlyProjectiles: fixture.projectiles.length,
    fixedStepMs: config.fixedStepMs,
    warmupSamples: WARMUP_SAMPLES,
    measuredSamples: MEASURED_SAMPLES
  },
  timingsMs: {
    pureFixedStep: summarize(stepDurationsMs),
    schemaSync: summarize(syncDurationsMs),
    roomFixedStep: summarize(roomStepDurationsMs)
  },
  patchBytes: {
    fullSnapshot: fullPatch.byteLength,
    latencyOnly: latencyOnlyPatch.byteLength,
    movingEntities: movingPatch.byteLength
  },
  acceptance: {
    pureFixedStepP95AtMost2Ms: percentile(stepDurationsMs, 0.95) <= 2,
    latencyOnlyDoesNotResendWorld: latencyOnlyPatch.byteLength < fullPatch.byteLength / 20
  }
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

function measureSamples(operation: () => void): number[] {
  const samples = new Array<number>(MEASURED_SAMPLES);
  for (let index = 0; index < MEASURED_SAMPLES; index += 1) {
    const startedAt = performance.now();
    operation();
    samples[index] = performance.now() - startedAt;
  }
  return samples;
}

function measureRoomStepSamples(): number[] {
  const samples = new Array<number>(MEASURED_SAMPLES);
  for (let index = 0; index < MEASURED_SAMPLES; index += 1) {
    hydrateDynamicEntities(schema, fixture);
    const startedAt = performance.now();
    const advanced = advanceFlyingCastle(fixture, config);
    hydrateDynamicEntities(schema, advanced);
    schema.game.tick = advanced.clock.tick;
    samples[index] = performance.now() - startedAt;
  }
  return samples;
}

function summarize(samples: readonly number[]) {
  return {
    p50: round(percentile(samples, 0.5), 4),
    p95: round(percentile(samples, 0.95), 4),
    max: round(Math.max(...samples), 4)
  };
}

function percentile(samples: readonly number[], ratio: number): number {
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] ?? 0;
}

function round(value: number, fractionDigits: number): number {
  return Number(value.toFixed(fractionDigits));
}

function encodeAllForView(encoder: Encoder<TownDefendersState>, view: StateView): Uint8Array {
  const iterator = { offset: 0 };
  encoder.encodeAll(iterator);
  return encoder.encodeAllView(view, iterator.offset, iterator);
}

function encodeChangesForView(encoder: Encoder<TownDefendersState>, view: StateView): Uint8Array {
  const iterator = { offset: 0 };
  encoder.encode(iterator);
  return encoder.encodeView(view, iterator.offset, iterator);
}

function indexParityState(
  original: FlyingCastleState,
  advanced: FlyingCastleState,
  currentTick: number
): FlyingCastleState {
  return currentTick % 2 === 0 ? advanced : original;
}

function hydrateSchema(source: FlyingCastleState): TownDefendersState {
  const state = new TownDefendersState();
  state.roomId = "BENCH196";
  state.phase = "active";
  state.displayConnected = true;
  state.hasGame = true;
  state.game.tick = source.clock.tick;
  state.game.elapsedMs = source.clock.elapsedMs;
  state.game.worldWidth = config.worldWidth;
  state.game.worldHeight = config.worldHeight;
  state.game.castle.x = source.castle.x;
  state.game.castle.y = source.castle.y;
  state.game.castle.hp = source.castleHp;
  state.game.castle.maxHp = source.castleMaxHp;
  hydrateDynamicEntities(state, source);
  return state;
}

function hydrateDynamicEntities(target: TownDefendersState, source: FlyingCastleState): void {
  reconcile(target.game.display.enemyShips, source.enemies, () => new EnemyState(), syncEnemy);
  reconcile(
    target.game.display.asteroids,
    source.asteroids,
    () => new AsteroidState(),
    syncAsteroid
  );
  reconcile(
    target.game.display.friendlyProjectiles,
    source.projectiles,
    () => new ProjectileState(),
    (state, entity) => {
      syncProjectile(state, entity, "friendly");
    }
  );
  reconcile(
    target.game.display.hostileProjectiles,
    source.hostileProjectiles,
    () => new ProjectileState(),
    (state, entity) => {
      syncProjectile(state, entity, "hostile");
    }
  );
  reconcile(
    target.game.display.homingMissiles,
    source.homingMissiles,
    () => new HomingMissileState(),
    syncMissile
  );
}

function reconcile<TSource extends { readonly id: string }, TTarget>(
  target: Map<string, TTarget>,
  source: readonly TSource[],
  create: () => TTarget,
  sync: (target: TTarget, source: TSource) => void
): void {
  const live = new Set(source.map(({ id }) => id));
  for (const key of target.keys()) if (!live.has(key)) target.delete(key);
  for (const entity of source) {
    let state = target.get(entity.id);
    if (state === undefined) {
      state = create();
      target.set(entity.id, state);
    }
    sync(state, entity);
  }
}

function syncMoving(
  target: {
    entityId: string;
    spawnSequence: number;
    x: number;
    y: number;
    velocityX: number;
    velocityY: number;
    radius: number;
  },
  source: {
    readonly id: string;
    readonly spawnSequence: number;
    readonly x: number;
    readonly y: number;
    readonly velocity: { readonly x: number; readonly y: number };
    readonly radius: number;
  }
): void {
  target.entityId = source.id;
  target.spawnSequence = source.spawnSequence;
  target.x = source.x;
  target.y = source.y;
  target.velocityX = source.velocity.x;
  target.velocityY = source.velocity.y;
  target.radius = source.radius;
}

function syncEnemy(target: EnemyState, source: FlyingCastleState["enemies"][number]): void {
  syncMoving(target, source);
  target.kind = source.kind;
  target.heading = source.heading;
  target.hp = source.hp;
  target.maxHp = source.maxHp;
}

function syncAsteroid(target: AsteroidState, source: FlyingCastleState["asteroids"][number]): void {
  syncMoving(target, source);
  target.hp = source.hp;
  target.maxHp = source.maxHp;
}

function syncProjectile(
  target: ProjectileState,
  source:
    FlyingCastleState["projectiles"][number] | FlyingCastleState["hostileProjectiles"][number],
  kind: "friendly" | "hostile"
): void {
  syncMoving(target, source);
  target.kind = kind;
}

function syncMissile(
  target: HomingMissileState,
  source: FlyingCastleState["homingMissiles"][number]
): void {
  syncMoving(target, source);
  target.heading = source.heading;
}
