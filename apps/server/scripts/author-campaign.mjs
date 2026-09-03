#!/usr/bin/env node
/**
 * Rebuilds the enemy catalogue and the wave table of the operator preset.
 *
 * The preset stays the source the server reads, but it lives outside the
 * repository and has been lost once already, so the authoring lives here: this
 * script is what twenty-six archetypes and thirty waves are regenerated from.
 * Everything else in the preset — the ship, the hulls, the loot, the autopilot —
 * is left exactly as it was found.
 *
 * Usage: node scripts/author-campaign.mjs [--preset <path>] [--dry-run]
 */
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";

import {
  enemyArchetypeSchema,
  waveDefinitionSchema
} from "../../../packages/protocol/src/balance.ts";

import { DEFAULT_SHIP_ARCHETYPES } from "../src/balance/shipCatalogue.ts";

import { defaultPresetPath } from "./balance-run.mjs";

const TICKS_PER_SECOND = 20;

/**
 * How the campaign is authored. Every one of these lives in the balance file
 * now, so an operator turns the campaign from the console and re-runs this;
 * what stands here is only what a file written before them gets.
 */
const FALLBACK_AUTHORING = {
  budgetBase: 14,
  budgetGrowth: 2,
  bossEscortShare: 0.5,
  asteroidEveryWaves: 3,
  // What one cannon hit takes off, and it has to be the crew's actual damage:
  // health below is written as "how many hits does this take", and while this
  // said 25 against a gun that does 38 - and a scale cut another quarter off -
  // the catalogue delivered 49% of every number it stated. An archetype
  // authored as four hits died in two.
  hpPerCannonShot: 38,
  hpScale: 1,
  damagePerSecondBase: 2,
  damagePerSecondPerSpawnCost: 2.2,
  bossDamagePerSecondCap: 26,
  laserDamageShare: 0.75,
  shipReach: 680,
  maxEngagementShare: 1.6,
  maxStandoffShare: 1.3,
  groupStartStepSeconds: 18,
  swarmIntervalSeconds: 7,
  lineIntervalSeconds: 14,
  heavyIntervalSeconds: 22,
  bossFloorSeconds: 30
};

/**
 * Read before anything below is evaluated, because the catalogue and the wave
 * table are built as this module loads and every number in them comes from
 * here. `main` reads the file again to write it; this pass is only for the
 * knobs.
 */
function readAuthoring() {
  const flag = process.argv.findIndex((one) => one === "--preset");
  const inline = process.argv.find((one) => one.startsWith("--preset="));
  const path =
    flag >= 0 && process.argv[flag + 1] !== undefined
      ? process.argv[flag + 1]
      : inline !== undefined
        ? inline.slice("--preset=".length)
        : defaultPresetPath();
  try {
    const document = JSON.parse(readFileSync(path, "utf8"));
    const presets = Array.isArray(document.presets) ? document.presets : [];
    const chosen = presets.find(({ id }) => id === document.activePresetId) ?? presets[0];
    return { ...FALLBACK_AUTHORING, ...(chosen?.tuning?.waveCampaign?.authoring ?? {}) };
  } catch {
    // A file that is missing or unreadable is the generator's own first run.
    return FALLBACK_AUTHORING;
  }
}

const authoring = readAuthoring();
const seconds = (value) => Math.max(0, Math.round(value * TICKS_PER_SECOND));

/**
 * Into how many shots a heavy barrel is broken up, and the smallest shot worth
 * having. Both damage and cooldown are divided, so the archetype puts out the
 * same damage per second and the budget below sees no difference - what changes
 * is that the exchange happens. Measured before this: a gunship lives 0.48 s
 * under focused fire and reloads in 1.6 s, a railer 0.6 s against 5.5 s, so an
 * enemy fired between a tenth and a third of a shot per life and the fight was
 * over before it answered. A swarm barrel already fires fast and is left alone
 * - three of four damage is one, and a wall of one-point shots is noise.
 */
const ENEMY_SHOT_SPLIT = 3;
const MIN_SPLIT_DAMAGE = 3;

/** Bullets only: a missile is a different threat, and a beam is not dodged. */
function splitBarrel(kind, damage, cooldown) {
  if (kind !== "bullet") return { damage, cooldown };
  const split = Math.max(1, Math.min(ENEMY_SHOT_SPLIT, Math.floor(damage / MIN_SPLIT_DAMAGE)));
  if (split === 1) return { damage, cooldown };
  const nextDamage = Math.max(1, Math.round(damage / split));
  // Cooldown follows the damage that survived rounding, not the split, so the
  // damage per second the author wrote is the damage per second delivered.
  return {
    damage: nextDamage,
    cooldown: Math.max(1, Math.round((cooldown * nextDamage) / damage))
  };
}

/**
 * A barrel, with its reach derived rather than typed twice. A shot that expires
 * before it arrives is a weapon that misses for reasons nobody can see, so the
 * engagement range is a share of how far the projectile actually flies.
 */
function weapon({
  kind = "bullet",
  damage,
  cooldown,
  speed,
  lifetime = 60,
  radius = 7,
  burst = 1,
  spread = 0,
  reachShare = 0.75,
  reach = null,
  shieldCost = null,
  turnRate = 2.2
}) {
  const flight = (speed * lifetime) / TICKS_PER_SECOND;
  const barrel = splitBarrel(kind, damage, cooldown);
  return {
    kind,
    cooldownTicks: barrel.cooldown,
    damage: barrel.damage,
    shieldHitCost: shieldCost ?? Math.max(1, Math.round(barrel.damage * 0.6)),
    projectileRadius: radius,
    projectileSpeedPerSecond: speed,
    projectileLifetimeTicks: lifetime,
    engagementRange: Math.round(reach ?? flight * reachShare),
    turnRatePerSecond: turnRate,
    burstCount: burst,
    burstSpreadRadians: spread,
    visual: null
  };
}

/**
 * The ship fires a 25-point cannon four times a second, so hit points are
 * written as "how many cannon shots does this take". A one-shot enemy is a
 * target, not a fight: nothing below dies to a single hit.
 */

/**
 * One knob over the whole catalogue. Health is written in cannon shots because
 * that is what the fight feels like, and this scales the lot at once when the
 * measurements say the crew cannot chew through it in the time a wave allows.
 */

const shots = (count) =>
  Math.max(1, Math.round(authoring.hpPerCannonShot * count * authoring.hpScale));

/**
 * What an archetype is allowed to put out, in damage per second, from what the
 * wave budget pays for it. Bursts were the hole: three shots on a one-second
 * cooldown read as one weapon and hit like three, and a pair of gunboats put
 * out fifty-four points a second on wave seven. The cap is enforced rather
 * than trusted — a barrel over it gets its cooldown stretched until the whole
 * archetype fits, which keeps the rhythm the author wrote and drops the volume.
 */
/**
 * A beam barrel. Speed and lifetime say nothing about a shot that arrives in
 * the tick it left, so they sit at the floor and the reach is stated outright:
 * for a beam it is both how far it carries and where the barrel opens fire.
 */
function beam({ damage, cooldown, reach, radius = 10, shieldCost = null }) {
  return weapon({
    kind: "laser",
    damage,
    cooldown,
    reach,
    radius,
    shieldCost,
    speed: 1,
    lifetime: 1
  });
}

/**
 * What share of a beam's paper output actually lands. A shell can be dodged and
 * a beam cannot, so priced at the same cap the beam has to count for more than
 * it says - otherwise "same damage a second" means twice the damage taken.
 *
 * Half was the first guess and it was too kind: measured over thirty runs a
 * cell, the beam families carried 330-640 points of the 2500 a run took, and
 * the ladder they displaced tougher ships from came out fifteen points softer
 * than it went in.
 */

function damagePerSecondCap(spawnCost, boss = false) {
  // A boss is a long fight, not a shredder. Priced like everything else it put
  // out sixty-eight points a second by wave thirty: an ordinary wave cost the
  // crew fifty points of hull, a boss wave cost six hundred, and every run
  // ended on one. Its budget buys health and presence; the barrels stay human.
  if (boss) return authoring.bossDamagePerSecondCap;
  return authoring.damagePerSecondPerSpawnCost * spawnCost + authoring.damagePerSecondBase;
}

function damagePerSecond(weapons) {
  return weapons.reduce((total, one) => {
    const paper = (one.damage * one.burstCount) / (one.cooldownTicks / TICKS_PER_SECOND);
    return total + (one.kind === "laser" ? paper / authoring.laserDamageShare : paper);
  }, 0);
}

function withinBudget(weapons, spawnCost, boss) {
  const cap = damagePerSecondCap(spawnCost, boss);
  const output = damagePerSecond(weapons);
  if (output <= cap) return weapons;
  const stretch = output / cap;
  return weapons.map((one) => ({
    ...one,
    cooldownTicks: Math.ceil(one.cooldownTicks * stretch)
  }));
}

/**
 * How far the crew's own gun reaches, from the preset the campaign is written
 * against: a 1000-unit shell living 0.68 seconds. Read it off the preset and do
 * not retype it from the core defaults, which fire slower - that mistake put
 * this at 490 and pulled every enemy in the catalogue 28% closer than the guns
 * warranted. Every enemy distance here is a share of this one, so the catalogue
 * follows the guns rather than being retyped.
 *
 * Nothing may out-range that by much. A sniper parked at 1400 firing 3443 was
 * unanswerable — the hull it shoots at cannot reach back, and no amount of
 * skill closes a gap the weapon does not have. Range identity comes from how an
 * archetype moves and how hard it hits at its distance, never from standing
 * where the fight cannot happen.
 */

/**
 * The reach every distance below was written against. Each archetype's range is
 * a statement about the crew's gun - a skirmisher in its face, a railer out past
 * where it can answer - so when the gun moves, the whole catalogue has to move
 * with it or the statements stop being true. Clamping alone does not do that: cut
 * to the new reach it put nineteen of thirty archetypes on the same distance and
 * the catalogue stopped saying anything about range at all.
 */
const AUTHORED_AGAINST_REACH = 1080;

function scaledToReach(distance) {
  return Math.round((distance * authoring.shipReach) / AUTHORED_AGAINST_REACH);
}

/**
 * Artillery is allowed to out-range the hull — that is what makes it artillery
 * — but only by enough that closing on it is a decision, not a hopeless chase.
 * The bot ranks an out-ranging shooter above the swarm in its face, so the gap
 * is answered by flying at it.
 */

/**
 * How much further than its own engagement range a shot is allowed to carry. A
 * bullet needs a little, so a target that backs off while the shot is in the
 * air is still hit; a missile needs much more, because it chases. Measured
 * before this: the median enemy bullet flew 2.9 times its engagement range and
 * a railer's 5.6, all left over from the ranges before they were cut - and the
 * arena carried five times the bullets it needed to, against a cap of 96.
 */
const BULLET_LIFETIME_MARGIN = 1.25;
const MISSILE_LIFETIME_MARGIN = 2.5;

function reachable(weapons) {
  return weapons.map((one) => {
    const engagementRange = Math.min(
      scaledToReach(one.engagementRange),
      Math.round(authoring.shipReach * authoring.maxEngagementShare)
    );
    // A beam arrives in the tick it leaves; its speed and lifetime are nominal
    // and mean nothing, so they are left exactly as the author wrote them.
    if (one.kind === "laser") return { ...one, engagementRange };
    const margin = one.kind === "missile" ? MISSILE_LIFETIME_MARGIN : BULLET_LIFETIME_MARGIN;
    const ticks = Math.ceil(
      ((engagementRange * margin) / one.projectileSpeedPerSecond) * TICKS_PER_SECOND
    );
    return {
      ...one,
      engagementRange,
      projectileLifetimeTicks: Math.max(1, Math.min(one.projectileLifetimeTicks, ticks))
    };
  });
}

function enemy({
  hp,
  radius,
  speed,
  distance,
  skill = "veteran",
  turn = 2.4,
  turnAccel = 6,
  turnBrake = 6,
  weapons,
  shape,
  scale = 1,
  label,
  cost,
  unlock,
  score,
  credits,
  loot,
  boss = false
}) {
  return {
    hp,
    radius,
    speedPerSecond: speed,
    preferredDistance: Math.min(
      scaledToReach(distance),
      Math.round(authoring.shipReach * authoring.maxStandoffShare)
    ),
    turnRatePerSecond: turn,
    turnAccelerationPerSecondSquared: turnAccel,
    turnBrakingPerSecondSquared: turnBrake,
    combatSkill: skill,
    weapons: reachable(withinBudget(weapons, cost, boss)),
    visual: { shape, modelScale: scale, showHealthBar: true },
    label,
    spawnPolicy: boss ? "boss" : "standard",
    spawnCost: cost,
    unlockWave: unlock,
    scoreReward: score,
    creditReward: credits,
    lootChance: loot
  };
}

/** Twenty standard archetypes in three families, and ten bosses. */
const ARCHETYPES = {
  // --- Swarm: cheap, fast, close, dies in two or three shots ---
  interceptor: enemy({
    label: "Перехватчик",
    hp: shots(2),
    radius: 18,
    speed: 260,
    distance: 320,
    turn: 3.6,
    turnAccel: 9,
    turnBrake: 9,
    shape: "ship-dart",
    scale: 0.9,
    cost: 1,
    unlock: 1,
    score: 12,
    credits: 1,
    loot: 0.15,
    weapons: [weapon({ damage: 4, cooldown: 12, speed: 520, lifetime: 30 })]
  }),
  wasp: enemy({
    label: "Оса",
    hp: shots(2.4),
    radius: 16,
    speed: 300,
    distance: 260,
    turn: 4,
    turnAccel: 11,
    turnBrake: 11,
    shape: "ship-needle",
    scale: 0.85,
    cost: 1,
    unlock: 1,
    score: 14,
    credits: 1,
    loot: 0.15,
    weapons: [weapon({ damage: 3, cooldown: 22, speed: 560, lifetime: 26 })]
  }),
  skirmisher: enemy({
    label: "Застрельщик",
    hp: shots(3),
    radius: 22,
    speed: 210,
    distance: 480,
    shape: "ship-arrowhead",
    cost: 2,
    unlock: 3,
    score: 18,
    credits: 2,
    loot: 0.18,
    weapons: [weapon({ damage: 5, cooldown: 30, speed: 620, lifetime: 40 })]
  }),
  lancer: enemy({
    label: "Копейщик",
    hp: shots(3.6),
    radius: 20,
    speed: 320,
    distance: 300,
    skill: "ace",
    turn: 3.4,
    shape: "ship-spear",
    cost: 3,
    unlock: 8,
    score: 26,
    credits: 3,
    loot: 0.2,
    weapons: [weapon({ damage: 9, cooldown: 26, speed: 700, lifetime: 30, burst: 3, spread: 0.2 })]
  }),

  /**
   * The first barrel the crew cannot dodge. It has to come close to use it, it
   * dies to two shots, and it is what teaches the shield seat that the answer
   * to a beam is the arc rather than the stick.
   */
  sparker: enemy({
    label: "Искра",
    hp: shots(4),
    radius: 18,
    speed: 240,
    distance: 300,
    turn: 3.4,
    turnAccel: 9,
    turnBrake: 9,
    shape: "ship-scissor",
    scale: 0.9,
    cost: 2,
    unlock: 8,
    score: 20,
    credits: 2,
    loot: 0.18,
    weapons: [beam({ damage: 7, cooldown: 32, reach: 380, radius: 8 })]
  }),

  // --- Line: the middle of every wave ---
  gunship: enemy({
    label: "Ганшип",
    hp: shots(4),
    radius: 28,
    speed: 150,
    distance: 650,
    shape: "ship-delta",
    cost: 2,
    unlock: 2,
    score: 25,
    credits: 2,
    loot: 0.22,
    weapons: [weapon({ damage: 10, cooldown: 30, speed: 640, lifetime: 55 })]
  }),
  escort: enemy({
    label: "Эскорт",
    hp: shots(4.8),
    radius: 30,
    speed: 170,
    distance: 700,
    shape: "ship-twinboom",
    cost: 3,
    unlock: 7,
    score: 28,
    credits: 3,
    loot: 0.22,
    weapons: [weapon({ damage: 8, cooldown: 24, speed: 660, lifetime: 55, burst: 2, spread: 0.1 })]
  }),
  missileCarrier: enemy({
    label: "Ракетоносец",
    hp: shots(5.6),
    radius: 38,
    speed: 95,
    distance: 900,
    shape: "ship-broadwing",
    cost: 4,
    unlock: 3,
    score: 30,
    credits: 4,
    loot: 0.3,
    weapons: [
      weapon({
        kind: "missile",
        damage: 26,
        cooldown: 70,
        speed: 300,
        lifetime: 130,
        turnRate: 1.8
      })
    ]
  }),
  sniper: enemy({
    label: "Снайпер",
    hp: shots(4.4),
    radius: 30,
    speed: 70,
    distance: 1400,
    skill: "ace",
    shape: "ship-needle",
    scale: 1.1,
    cost: 3,
    unlock: 4,
    score: 30,
    credits: 3,
    loot: 0.25,
    weapons: [weapon({ damage: 30, cooldown: 100, speed: 900, lifetime: 90, reachShare: 0.85 })]
  }),
  gunboat: enemy({
    label: "Канонерка",
    hp: shots(6),
    radius: 34,
    speed: 130,
    distance: 750,
    shape: "ship-blockfrigate",
    cost: 4,
    unlock: 6,
    score: 34,
    credits: 4,
    loot: 0.24,
    weapons: [weapon({ damage: 9, cooldown: 20, speed: 600, lifetime: 60, burst: 3, spread: 0.22 })]
  }),
  railer: enemy({
    label: "Рельса",
    hp: shots(5),
    radius: 26,
    speed: 110,
    distance: 1200,
    skill: "ace",
    shape: "ship-lancer",
    cost: 4,
    unlock: 10,
    score: 36,
    credits: 4,
    loot: 0.24,
    weapons: [weapon({ damage: 38, cooldown: 110, speed: 1100, lifetime: 80, reachShare: 0.8 })]
  }),
  mortar: enemy({
    label: "Мортира",
    hp: shots(6.8),
    radius: 36,
    speed: 90,
    distance: 1000,
    shape: "ship-hammer",
    cost: 5,
    unlock: 12,
    score: 40,
    credits: 5,
    loot: 0.26,
    weapons: [
      weapon({ damage: 14, cooldown: 52, speed: 480, lifetime: 90, burst: 4, spread: 0.35 })
    ]
  }),
  warden: enemy({
    label: "Страж периметра",
    hp: shots(8.8),
    radius: 40,
    speed: 105,
    distance: 560,
    turn: 1.8,
    shape: "ship-hexcorvette",
    scale: 1.1,
    cost: 5,
    unlock: 11,
    score: 42,
    credits: 5,
    loot: 0.28,
    weapons: [
      weapon({ damage: 12, cooldown: 26, speed: 620, lifetime: 50, burst: 2, spread: 0.14 })
    ]
  }),

  lantern: enemy({
    label: "Фонарь",
    hp: shots(8),
    radius: 32,
    speed: 150,
    distance: 480,
    turn: 2,
    shape: "ship-ringrunner",
    scale: 1.05,
    cost: 4,
    unlock: 14,
    score: 40,
    credits: 4,
    loot: 0.26,
    weapons: [beam({ damage: 15, cooldown: 45, reach: 520, radius: 10 })]
  }),

  // --- Heavy: slow, thick, and the reason a wave has to be fought ---
  bulwark: enemy({
    label: "Оплот",
    hp: shots(10.4),
    radius: 46,
    speed: 85,
    distance: 620,
    turn: 1.4,
    turnAccel: 3,
    turnBrake: 3,
    shape: "ship-blockfrigate",
    scale: 1.3,
    cost: 6,
    unlock: 9,
    score: 55,
    credits: 6,
    loot: 0.32,
    weapons: [
      weapon({ damage: 16, cooldown: 34, speed: 560, lifetime: 60, burst: 2, spread: 0.16 })
    ]
  }),
  siege: enemy({
    label: "Осадная платформа",
    hp: shots(12),
    radius: 50,
    speed: 60,
    distance: 1150,
    turn: 1.2,
    shape: "station-quad",
    scale: 1.2,
    cost: 7,
    unlock: 16,
    score: 65,
    credits: 7,
    loot: 0.34,
    weapons: [
      weapon({
        kind: "missile",
        damage: 30,
        cooldown: 60,
        speed: 280,
        lifetime: 150,
        turnRate: 1.5
      }),
      weapon({ damage: 12, cooldown: 30, speed: 600, lifetime: 60 })
    ]
  }),
  dreadnought: enemy({
    label: "Дредноут",
    hp: shots(13.6),
    radius: 54,
    speed: 75,
    distance: 800,
    turn: 1.1,
    turnAccel: 2.5,
    turnBrake: 2.5,
    shape: "ship-manta",
    scale: 1.3,
    cost: 8,
    unlock: 14,
    score: 70,
    credits: 8,
    loot: 0.36,
    weapons: [
      weapon({ damage: 18, cooldown: 28, speed: 620, lifetime: 60, burst: 2, spread: 0.18 }),
      weapon({
        kind: "missile",
        damage: 22,
        cooldown: 90,
        speed: 300,
        lifetime: 130,
        turnRate: 1.6
      })
    ]
  }),
  hive: enemy({
    label: "Улей",
    hp: shots(11.2),
    radius: 48,
    speed: 95,
    distance: 950,
    shape: "station-hexhub",
    scale: 1.2,
    cost: 7,
    unlock: 18,
    score: 68,
    credits: 7,
    loot: 0.36,
    weapons: [
      weapon({
        kind: "missile",
        damage: 16,
        cooldown: 70,
        speed: 260,
        lifetime: 150,
        burst: 3,
        spread: 0.4,
        turnRate: 1.4
      })
    ]
  }),
  leviathan: enemy({
    label: "Левиафан",
    hp: shots(16),
    radius: 58,
    speed: 70,
    distance: 700,
    turn: 1,
    turnAccel: 2,
    turnBrake: 2,
    shape: "ship-crescent",
    scale: 1.4,
    cost: 9,
    unlock: 22,
    score: 85,
    credits: 9,
    loot: 0.4,
    weapons: [
      weapon({ damage: 20, cooldown: 24, speed: 640, lifetime: 60, burst: 3, spread: 0.2 }),
      weapon({
        kind: "missile",
        damage: 26,
        cooldown: 80,
        speed: 300,
        lifetime: 140,
        turnRate: 1.7
      })
    ]
  }),

  /**
   * A beam that does not have to close. It is slow enough to be left for later
   * and thick enough that leaving it costs the hull the whole time: the wave
   * where standing still stops being free.
   */
  smelter: enemy({
    label: "Плавильня",
    hp: shots(16),
    radius: 54,
    speed: 80,
    distance: 520,
    turn: 0.9,
    turnAccel: 2,
    turnBrake: 2,
    shape: "station-refinery",
    scale: 1.3,
    cost: 7,
    unlock: 22,
    score: 78,
    credits: 8,
    loot: 0.38,
    weapons: [beam({ damage: 24, cooldown: 45, reach: 620, radius: 12 })]
  }),

  // --- Bosses: one per fifth wave, and three more for the director past thirty ---
  boss: enemy({
    label: "Молот",
    boss: true,
    hp: shots(20),
    radius: 90,
    speed: 60,
    distance: 700,
    turn: 1,
    turnAccel: 2,
    turnBrake: 2,
    shape: "boss-hammerhead",
    scale: 1.4,
    cost: 15,
    unlock: 5,
    score: 250,
    credits: 30,
    loot: 1,
    weapons: [
      weapon({
        kind: "missile",
        damage: 26,
        cooldown: 45,
        speed: 300,
        lifetime: 140,
        burst: 2,
        spread: 0.3,
        turnRate: 1.6
      }),
      weapon({ damage: 14, cooldown: 26, speed: 620, lifetime: 60 })
    ]
  }),
  bossCrab: enemy({
    label: "Краб",
    boss: true,
    hp: shots(32),
    radius: 96,
    speed: 66,
    distance: 620,
    turn: 1,
    shape: "boss-crab",
    scale: 1.4,
    cost: 18,
    unlock: 10,
    score: 320,
    credits: 36,
    loot: 1,
    weapons: [
      weapon({ damage: 18, cooldown: 20, speed: 640, lifetime: 55, burst: 3, spread: 0.26 }),
      weapon({
        kind: "missile",
        damage: 30,
        cooldown: 70,
        speed: 290,
        lifetime: 150,
        turnRate: 1.7
      })
    ]
  }),
  bossSerpent: enemy({
    label: "Змей",
    boss: true,
    hp: shots(48),
    radius: 100,
    speed: 78,
    distance: 560,
    turn: 1.4,
    shape: "boss-serpent",
    scale: 1.45,
    cost: 21,
    unlock: 15,
    score: 400,
    credits: 42,
    loot: 1,
    weapons: [
      weapon({ damage: 16, cooldown: 14, speed: 700, lifetime: 50, burst: 2, spread: 0.18 }),
      weapon({ kind: "missile", damage: 26, cooldown: 55, speed: 320, lifetime: 150, turnRate: 2 })
    ]
  }),
  bossFortress: enemy({
    label: "Крепость",
    boss: true,
    hp: shots(64),
    radius: 108,
    speed: 48,
    distance: 900,
    turn: 0.8,
    shape: "boss-fortress",
    scale: 1.5,
    cost: 24,
    unlock: 20,
    score: 480,
    credits: 48,
    loot: 1,
    weapons: [
      weapon({ damage: 20, cooldown: 22, speed: 620, lifetime: 65, burst: 4, spread: 0.42 }),
      weapon({
        kind: "missile",
        damage: 34,
        cooldown: 75,
        speed: 280,
        lifetime: 160,
        turnRate: 1.5
      })
    ]
  }),
  /**
   * The beam boss. Its shell barrel is what the crew dodges and its beam is
   * what the shield has to be pointed at, so neither seat can sit the fight out.
   */
  bossPrism: enemy({
    label: "Призма",
    boss: true,
    hp: shots(84),
    radius: 108,
    speed: 58,
    distance: 640,
    turn: 0.9,
    shape: "boss-obelisk",
    scale: 1.5,
    cost: 27,
    unlock: 25,
    score: 560,
    credits: 54,
    loot: 1,
    weapons: [
      beam({ damage: 26, cooldown: 60, reach: 700, radius: 16 }),
      weapon({ damage: 12, cooldown: 30, speed: 660, lifetime: 60, burst: 2, spread: 0.2 })
    ]
  }),
  bossDreadnought: enemy({
    label: "Владыка",
    boss: true,
    hp: shots(84),
    radius: 112,
    speed: 60,
    distance: 760,
    turn: 0.9,
    shape: "boss-dreadnought",
    scale: 1.5,
    cost: 27,
    unlock: 30,
    score: 560,
    credits: 54,
    loot: 1,
    weapons: [
      weapon({ damage: 22, cooldown: 18, speed: 660, lifetime: 60, burst: 3, spread: 0.24 }),
      weapon({
        kind: "missile",
        damage: 32,
        cooldown: 60,
        speed: 300,
        lifetime: 160,
        burst: 2,
        spread: 0.3,
        turnRate: 1.7
      })
    ]
  }),
  bossMothership: enemy({
    label: "Материнский корабль",
    boss: true,
    hp: shots(110),
    radius: 120,
    speed: 52,
    distance: 820,
    turn: 0.8,
    shape: "boss-mothership",
    scale: 1.6,
    cost: 30,
    unlock: 35,
    score: 700,
    credits: 66,
    loot: 1,
    weapons: [
      weapon({ damage: 24, cooldown: 18, speed: 660, lifetime: 65, burst: 4, spread: 0.4 }),
      weapon({
        kind: "missile",
        damage: 34,
        cooldown: 55,
        speed: 300,
        lifetime: 170,
        burst: 2,
        spread: 0.32,
        turnRate: 1.8
      })
    ]
  }),
  bossSplitter: enemy({
    label: "Расщепитель",
    boss: true,
    hp: shots(130),
    radius: 116,
    speed: 64,
    distance: 700,
    turn: 1,
    shape: "boss-splitter",
    scale: 1.55,
    cost: 33,
    unlock: 40,
    score: 780,
    credits: 72,
    loot: 1,
    weapons: [
      weapon({ damage: 26, cooldown: 16, speed: 680, lifetime: 60, burst: 3, spread: 0.26 }),
      weapon({
        kind: "missile",
        damage: 36,
        cooldown: 55,
        speed: 310,
        lifetime: 170,
        turnRate: 1.9
      })
    ]
  }),
  bossVoideye: enemy({
    label: "Око пустоты",
    boss: true,
    hp: shots(150),
    radius: 118,
    speed: 58,
    distance: 880,
    turn: 0.9,
    shape: "boss-voideye",
    scale: 1.6,
    cost: 36,
    unlock: 45,
    score: 860,
    credits: 78,
    loot: 1,
    weapons: [
      weapon({ damage: 28, cooldown: 16, speed: 700, lifetime: 65, burst: 4, spread: 0.44 }),
      weapon({
        kind: "missile",
        damage: 38,
        cooldown: 50,
        speed: 320,
        lifetime: 170,
        burst: 2,
        spread: 0.34,
        turnRate: 1.9
      })
    ]
  }),
  bossSolar: enemy({
    label: "Солнечный трон",
    boss: true,
    hp: shots(175),
    radius: 124,
    speed: 54,
    distance: 940,
    turn: 0.8,
    shape: "boss-solar",
    scale: 1.65,
    cost: 40,
    unlock: 50,
    score: 950,
    credits: 84,
    loot: 1,
    weapons: [
      weapon({ damage: 30, cooldown: 15, speed: 720, lifetime: 70, burst: 4, spread: 0.46 }),
      weapon({
        kind: "missile",
        damage: 40,
        cooldown: 48,
        speed: 330,
        lifetime: 180,
        burst: 2,
        spread: 0.36,
        turnRate: 2
      })
    ]
  })
};

/**
 * The ramp, as one number.
 *
 * A wave costs `budgetBase + budgetGrowth * (n - 1)` from the authoring block, in the same
 * spawn-cost currency the director spends, and the table is filled to that
 * budget out of what has unlocked. Written by hand the early waves tracked the
 * director's own curve, which climbs about two and a half a wave — that is a
 * crew growing by one module a wave against an enemy growing by a heavy every
 * three, and it ended every run around wave nine. Here the slope is the knob.
 */
/**
 * The output the catalogue is balanced against.
 *
 * Health above is written in cannon shots, so the shot itself belongs to the
 * campaign. Measured at twenty-five, the base hull spent ninety seconds a wave
 * and bled two hundred points doing it, while the laser hull cleared the same
 * wave in fifty-five and took forty: that gap is the gun, not the pilot. The
 * hulls that override these keep their identity, so the ratio between them is
 * what is preserved, not the absolute numbers.
 */
const SHIP = {
  friendlyProjectileDamage: 38,
  mgDamage: 10,
  /**
   * The kinetic identity, and the answer to a shell that can be dodged: a high
   * rate of fire. Half its shots miss where a beam misses none, so it makes the
   * difference up in volume. Both other hulls override this — the beam at four,
   * the missile rack at seven — so it lands on the base hull alone.
   */
  fireCooldownTicks: 3,
  /**
   * A fatter shell clips the enemy that steps aside. Kinetic hit 44% where a
   * beam hits 82%, and the beam pays for that with reach, not with volume of
   * fire — this is the other half of what the kinetic hull trades.
   */
  projectileRadius: 14,
  /**
   * A shell that takes nine tenths of a second to arrive is a shell an enemy
   * with any evasion at all steps out of: the kinetic hull hit 36% of the time
   * against 82% for the beam, and perfect lead moved it by three points. Speed
   * is what a kinetic gun answers evasion with, and it lengthens the reach to
   * fifteen hundred, which is also what makes artillery answerable.
   */
  projectileSpeedPerSecond: 1000,
  /**
   * The base hull is what the campaign is measured against, and under a fight
   * that lasts a minute and a half it was the weakest of the three: a hundred
   * and fifty points of damage a wave against forty for the beam hull, because
   * it is slower, wider and its shells can be stepped out of. The other two
   * override both of these, so this lifts the baseline alone.
   */
  spaceshipMaxHp: 620,
  shieldCapacity: 120,
  /** Wider than the beam hull and slower than everything: it needs the legs. */
  spaceshipSpeedPerSecond: 380
};

/**
 * What the measuring bot is allowed to know, per weapon kind.
 *
 * A kinetic shell has to be led; the ace profile led at six tenths and hit 36%
 * of the time, against 82% for the beam that needs no lead at all. That is not
 * a hull being worse, it is the stand shooting badly with one of them, and
 * every number measured through it inherits the error. An ace leads properly.
 */
/**
 * The measuring ladder, stated in full rather than patched.
 *
 * Every field the campaign is calibrated against is named here for every rung,
 * because a patch that only adds is not a source: dropping a line from it left
 * the value it had written last time sitting in the preset, and two matrices
 * came back identical while the script said otherwise.
 *
 * The rungs are skills, not numbers. Shield discipline is the most valuable
 * thing a crew can do in this game — handed to the beginner it carried him past
 * the veteran, 52% of runs to wave thirty against 47% — so it is what the
 * veteran has and the beginner does not. Dodging shots is the ace's.
 */
const AUTOPILOT_PROFILES = {
  rookie: {
    leadFactor: { kinetic: 0.35, laser: 0.35, missile: 0.35 },
    reactionTicks: 12,
    retargetIntervalTicks: 40,
    aimJitterRadians: 0.18,
    standoffShare: 0.6,
    // A floor, not a station: it only has to keep the beginner out of the swarm.
    // Written above the barrel's reach it did the opposite - parked him where
    // nothing he fired could arrive - so it moved down with the guns.
    standoffDistance: 250,
    cannonConeRadians: 0.6,
    mgConeRadians: 0.9,
    cannonHeatCeiling: 1,
    mgHeatCeiling: 1,
    orbit: false,
    evadeMissiles: false,
    dodgeBullets: false,
    // A beginner does use the shield — just late, and only when he still has
    // half a battery to spend on it. Denied it altogether he never saw wave ten
    // on any hull; handed it on the veteran's terms he beat the veteran.
    threatAwareShield: true,
    shieldLeadTicks: 8,
    shieldMinEnergy: 0.5,
    evadeHorizonTicks: 0
  },
  veteran: {
    leadFactor: { kinetic: 0.7, laser: 0.8, missile: 0.65 },
    reactionTicks: 16,
    retargetIntervalTicks: 36,
    aimJitterRadians: 0.12,
    standoffShare: 0.85,
    standoffDistance: 400,
    cannonConeRadians: 0.2,
    mgConeRadians: 0.3,
    cannonHeatCeiling: 0.6,
    mgHeatCeiling: 0.5,
    orbit: false,
    evadeMissiles: true,
    dodgeBullets: false,
    threatAwareShield: true,
    shieldLeadTicks: 20,
    shieldMinEnergy: 0.35,
    evadeHorizonTicks: 12
  },
  ace: {
    leadFactor: { kinetic: 1, laser: 1, missile: 0.9 },
    reactionTicks: 10,
    retargetIntervalTicks: 30,
    aimJitterRadians: 0,
    standoffShare: 0.85,
    standoffDistance: 400,
    cannonConeRadians: 0.06,
    mgConeRadians: 0.25,
    cannonHeatCeiling: 0.95,
    mgHeatCeiling: 0.9,
    orbit: false,
    evadeMissiles: true,
    dodgeBullets: true,
    threatAwareShield: true,
    shieldLeadTicks: 20,
    shieldMinEnergy: 0.15,
    evadeHorizonTicks: 12
  }
};

/**
 * What differs by barrel rather than by rung, and why.
 *
 * A beam hits whatever it is pointed at, so its pilot circles and keeps firing;
 * a rack of missiles that steer themselves is fought from further out and needs
 * no evasion of its own. Stating the ladder in full erased these and the beam
 * hull fell from 90% of runs reaching wave thirty to 27 — the rung was right,
 * the barrel had been forgotten.
 */
const AUTOPILOT_BY_KIND = {
  kinetic: {
    // A shell has flight time, so the far half of its reach is where a moving
    // target is most likely to have left before the shot arrives. The middle
    // of the reach is the honest ring for it, and it is still twice as far out
    // as the four hundred the profile used to name.
    veteran: { standoffShare: 0.5 },
    ace: { standoffShare: 0.5 }
  },
  laser: {
    // A beam either crosses the target this instant or it does not, so the
    // sideways half of an orbit is time the barrel spends off bearing. The
    // veteran was circling with a hand that shakes and reached wave thirty in
    // 15% of its runs, against 40% for the beginner who bores straight in.
    veteran: { orbit: false, reactionTicks: 20, mgConeRadians: 0.35, mgHeatCeiling: 0.7 },
    ace: { orbit: false, reactionTicks: 20, mgConeRadians: 0.5, mgHeatCeiling: 0.95 }
  },
  missile: {
    veteran: {
      reactionTicks: 20,
      standoffShare: 0.75,
      standoffDistance: 450,
      evadeMissiles: false,
      evadeHorizonTicks: 0,
      shieldLeadTicks: 10,
      cannonConeRadians: 0.12,
      mgConeRadians: 0.35
    },
    ace: {
      reactionTicks: 20,
      standoffShare: 0.75,
      standoffDistance: 450,
      evadeMissiles: false,
      evadeHorizonTicks: 0,
      shieldLeadTicks: 10,
      cannonConeRadians: 0.12,
      mgConeRadians: 0.5,
      cannonHeatCeiling: 0.8
    }
  }
};

function retuneProfile(kind, level, profile) {
  const wanted = AUTOPILOT_PROFILES[level];
  if (wanted === undefined) return profile;
  const { leadFactor, ...shared } = wanted;
  return {
    ...profile,
    ...shared,
    ...(AUTOPILOT_BY_KIND[kind]?.[level] ?? {}),
    leadFactor: leadFactor[kind] ?? profile.leadFactor
  };
}

function retuneAutopilot(autopilot) {
  // The block is `{ level, profiles }`, and only the profiles are touched: the
  // level beside them is the stand's chosen skill, and walking it as a map of
  // profiles turns the string into a map of its own letters.
  if (autopilot?.profiles === undefined) return autopilot;
  return {
    ...autopilot,
    profiles: Object.fromEntries(
      Object.entries(autopilot.profiles).map(([kind, profiles]) => [
        kind,
        Object.fromEntries(
          Object.entries(profiles).map(([level, profile]) => [
            level,
            retuneProfile(kind, level, profile)
          ])
        )
      ])
    )
  };
}

const HULL_DAMAGE_OVERRIDES = {
  blade: { friendlyProjectileDamage: 46, mgDamage: 14 },
  /**
   * Homing needs no aim, which is exactly what a beginner lacks: the missile
   * hull reached wave thirty in 63% of beginner runs, against 3% and 0% for the
   * other two. It pays for that in cadence — the tank stays a tank, it just
   * stops out-shooting hulls that have to aim.
   */
  bastion: { fireCooldownTicks: 9 }
};

/**
 * The tree and the tail a hull is authored with. Both live in the catalogue
 * beside the hull they belong to, and a saved preset keeps its own copy of them
 * - the migration never touches `shipArchetypes` - so without this pass a
 * rebuilt campaign would still be played with the trees the file was saved
 * with.
 */
function resetTree(id, hull) {
  const authored = DEFAULT_SHIP_ARCHETYPES[id];
  if (authored === undefined) return hull;
  return { ...hull, tiers: authored.tiers, endlessTier: authored.endlessTier };
}

function retuneHullDamage(id, hull) {
  const overrides = HULL_DAMAGE_OVERRIDES[id];
  if (overrides === undefined) return hull;
  return {
    ...hull,
    overrides: { ...hull.overrides, stats: { ...hull.overrides.stats, ...overrides } }
  };
}

/** Waves that also drop rocks; they cost nothing and read as weather. */

/** Past the table the director carries on, and on the same slope. */
/** How many waves the table below carries; past it the director takes over. */
const CAMPAIGN_WAVES = 30;

const DIRECTOR = {
  // The director opens at wave CAMPAIGN_WAVES + 1, so its budget has to pick
  // the campaign's curve up where the table leaves it. Derived from the opening
  // wave's budget instead, the first directed wave arrived a third smaller than
  // the authored one before it, and the campaign visibly stepped down.
  baseBudget: Math.max(
    1,
    Math.round(
      authoring.budgetBase +
        (authoring.budgetGrowth - Math.max(1, Math.round(authoring.budgetGrowth))) * CAMPAIGN_WAVES
    )
  ),
  budgetGrowth: Math.max(1, Math.round(authoring.budgetGrowth)),
  budgetCap: 120,
  hpGrowth: 0.04,
  hpMultiplierCap: 8,
  tempoGrowth: 0.02,
  tempoMultiplierCap: 3,
  bossWaveInterval: 5
};

const FAMILIES = {
  swarm: ["interceptor", "wasp", "skirmisher", "lancer", "sparker"],
  line: [
    "gunship",
    "escort",
    "missileCarrier",
    "sniper",
    "gunboat",
    "railer",
    "mortar",
    "warden",
    "lantern"
  ],
  heavy: ["bulwark", "siege", "dreadnought", "hive", "leviathan", "smelter"]
};

/** How the wave's budget is split between the three families as it grows. */
function familyShares(waveNumber) {
  if (waveNumber <= 3) return { swarm: 1, line: 0, heavy: 0 };
  if (waveNumber <= 8) return { swarm: 0.5, line: 0.5, heavy: 0 };
  if (waveNumber <= 15) return { swarm: 0.35, line: 0.45, heavy: 0.2 };
  if (waveNumber <= 23) return { swarm: 0.25, line: 0.4, heavy: 0.35 };
  return { swarm: 0.2, line: 0.35, heavy: 0.45 };
}

const SECTOR_CYCLE = ["N", "E", "S", "W", "NE", "SW", "SE", "NW"];

/**
 * The strongest thing in a family the wave has unlocked, and the one before it:
 * a wave built only from its newest toy stops feeling like a campaign.
 */
function unlockedIn(family, waveNumber) {
  return FAMILIES[family].filter((kind) => ARCHETYPES[kind].unlockWave <= waveNumber);
}

function bossForWave(waveNumber) {
  const bosses = Object.entries(ARCHETYPES)
    .filter(([, one]) => one.spawnPolicy === "boss" && one.unlockWave <= waveNumber)
    .sort((left, right) => right[1].unlockWave - left[1].unlockWave);
  return bosses[0]?.[0];
}

function buildWave(waveNumber) {
  const waveBudget = authoring.budgetBase + authoring.budgetGrowth * (waveNumber - 1);
  const boss = waveNumber % 5 === 0 ? bossForWave(waveNumber) : undefined;
  // The boss is paid for out of the wave, not added on top of it. Added on top
  // it made every fifth wave cost 1.4 to 1.8 times the one before it - wave 5
  // stood at 34 against a budget of 18.8 - and every measured median landed on
  // a multiple of five. Early bosses cost most of a wave by themselves, so the
  // escort keeps a floor rather than being squeezed to nothing.
  const budget =
    boss === undefined
      ? waveBudget
      : Math.max(waveBudget * authoring.bossEscortShare, waveBudget - ARCHETYPES[boss].spawnCost);
  const shares = familyShares(waveNumber);
  const groups = [];
  let slot = 0;
  for (const [family, share] of Object.entries(shares)) {
    if (share <= 0) continue;
    const pool = unlockedIn(family, waveNumber);
    if (pool.length === 0) continue;
    // The newest two of the family, so a wave mixes rather than repeats.
    const picks = pool.slice(-2);
    for (const [index, kind] of picks.entries()) {
      const portion = (budget * share) / picks.length;
      const count = Math.max(1, Math.round(portion / ARCHETYPES[kind].spawnCost));
      const step = authoring.groupStartStepSeconds;
      const start = slot * step + index * (step / 2);
      const interval =
        family === "swarm"
          ? authoring.swarmIntervalSeconds
          : family === "line"
            ? authoring.lineIntervalSeconds
            : authoring.heavyIntervalSeconds;
      groups.push([kind, count, start, interval, [SECTOR_CYCLE[(waveNumber + slot + index) % 8]]]);
    }
    slot += 1;
  }
  if (waveNumber % authoring.asteroidEveryWaves === 0) {
    groups.push(["asteroid", 2, 18, 12, []]);
  }
  if (boss !== undefined) {
    // Late enough that the wave is a fight first and a boss second; it waits for
    // the field to clear anyway, so this only decides when it becomes possible.
    groups.push([boss, 1, authoring.bossFloorSeconds, 10, [SECTOR_CYCLE[waveNumber % 8]]]);
  }
  return groups;
}

const WAVES = Array.from({ length: CAMPAIGN_WAVES }, (_unused, index) => buildWave(index + 1));

function toWave(groups) {
  return {
    entries: groups.map(([kind, count, start, interval, sectors]) => ({
      kind,
      count,
      startDelayTicks: seconds(start),
      spawnIntervalTicks: Math.max(1, seconds(interval)),
      sectors,
      hpMultiplier: null,
      tempoMultiplier: null
    })),
    hpMultiplier: null,
    tempoMultiplier: null
  };
}

function validate(archetypes, waves) {
  for (const [kind, archetype] of Object.entries(archetypes)) {
    const output = damagePerSecond(archetype.weapons);
    const cap = damagePerSecondCap(archetype.spawnCost, archetype.spawnPolicy === "boss");
    if (output > cap + 0.001) {
      throw new Error(
        `${kind} puts out ${output.toFixed(1)} damage a second against a cap of ${cap.toFixed(1)}`
      );
    }
    const parsed = enemyArchetypeSchema.safeParse(archetype);
    if (!parsed.success) {
      throw new Error(`${kind}: ${JSON.stringify(parsed.error.issues, null, 2)}`);
    }
  }
  waves.forEach((wave, index) => {
    const parsed = waveDefinitionSchema.safeParse(wave);
    if (!parsed.success) {
      throw new Error(`wave ${String(index + 1)}: ${JSON.stringify(parsed.error.issues, null, 2)}`);
    }
    for (const entry of wave.entries) {
      if (entry.kind !== "asteroid" && archetypes[entry.kind] === undefined) {
        throw new Error(`wave ${String(index + 1)} names an unknown kind: ${entry.kind}`);
      }
      const unlock = archetypes[entry.kind]?.unlockWave ?? 1;
      if (unlock > index + 1) {
        throw new Error(
          `wave ${String(index + 1)} spawns ${entry.kind}, which unlocks at ${String(unlock)}`
        );
      }
    }
  });
}

/**
 * The second reader of this campaign. A server without a preset falls back on
 * the core's built-in balance, and that is also what the smoke and the browser
 * suite play. Left hand-written it was a different game: five archetypes
 * against thirty, no wave table at all, and enemies dying to one or two hits
 * because their health had never been moved onto the "how many cannon hits"
 * model the console works in. So the generator writes both. One source, no
 * drift.
 */
const AUTHORED_MODULE_PATH = fileURLToPath(
  new URL("../../../packages/game-core/src/authoredCampaign.ts", import.meta.url)
);

function authoredModule(waves) {
  const literal = (value) => JSON.stringify(value, null, 2);
  return [
    `/**
 * The campaign as authored, in the shape the simulation reads.
 *
 * Generated by \`apps/server/scripts/author-campaign.mjs\` - do not edit by hand
 * and do not split it. It is one table, and it is long because the campaign is
 * thirty waves over thirty archetypes; every number in it has its reason in the
 * generator, beside the line that produced it.
 *
 * The operator preset carries the same table and is what a running server
 * reads. This is what it starts from when there is no preset - which is also
 * what the network smoke and the browser suite play.
 */`,
    'import { type SpaceshipSimulationConfig } from "./spaceshipSimulation.ts";',
    "",
    "/** What the campaign was balanced against: the gun its health is counted in. */",
    `export const AUTHORED_SHIP_STATS = ${literal(SHIP)} satisfies Partial<SpaceshipSimulationConfig>;`,
    "",
    `export const AUTHORED_ENEMY_ARCHETYPES: SpaceshipSimulationConfig["enemyArchetypes"] = ${literal(ARCHETYPES)};`,
    "",
    `export const AUTHORED_WAVES: SpaceshipSimulationConfig["waveCampaign"]["waves"] = ${literal(waves)};`,
    "",
    `export const AUTHORED_DIRECTOR: SpaceshipSimulationConfig["waveCampaign"]["director"] = ${literal(DIRECTOR)};`,
    ""
  ].join("\n");
}

async function main() {
  const { values } = parseArgs({
    options: { preset: { type: "string" }, "dry-run": { type: "boolean" } }
  });
  const path = values.preset ?? defaultPresetPath();
  const waves = WAVES.map(toWave);
  validate(ARCHETYPES, waves);

  const original = await readFile(path, "utf8");
  const document = JSON.parse(original);
  for (const preset of document.presets ?? []) {
    preset.tuning.enemyArchetypes = ARCHETYPES;
    Object.assign(preset.tuning, SHIP);
    preset.tuning.autopilot = retuneAutopilot(preset.tuning.autopilot);
    preset.tuning.shipArchetypes = Object.fromEntries(
      Object.entries(preset.tuning.shipArchetypes ?? {}).map(([id, hull]) => [
        id,
        retuneHullDamage(id, resetTree(id, hull))
      ])
    );
    // The knobs go back in with the table they produced, so the file describes
    // how it was built and the console edits the same numbers this read.
    preset.tuning.waveCampaign = {
      ...preset.tuning.waveCampaign,
      waves,
      director: DIRECTOR,
      authoring
    };
  }
  const summary = {
    preset: path,
    archetypes: Object.keys(ARCHETYPES).length,
    // What one authored shot is actually worth. Health here is written as "how
    // many cannon hits does this take", and the translation had drifted to
    // half: 1 means the catalogue delivers the number it states.
    hitsPerAuthoredShot: Number(
      (
        (authoring.hpPerCannonShot * authoring.hpScale) /
        (document.presets?.[0]?.tuning?.friendlyProjectileDamage ?? authoring.hpPerCannonShot)
      ).toFixed(2)
    ),
    hottest: Object.entries(ARCHETYPES)
      .map(([kind, one]) => ({
        kind,
        dps: Number(damagePerSecond(one.weapons).toFixed(1)),
        cap: damagePerSecondCap(one.spawnCost, one.spawnPolicy === "boss")
      }))
      .sort((left, right) => right.dps - left.dps)
      .slice(0, 3),
    bosses: Object.values(ARCHETYPES).filter((one) => one.spawnPolicy === "boss").length,
    waves: waves.length,
    bossWaves: waves
      .map((wave, index) =>
        wave.entries.some((entry) => ARCHETYPES[entry.kind]?.spawnPolicy === "boss")
          ? index + 1
          : null
      )
      .filter((value) => value !== null)
  };
  if (values["dry-run"]) {
    console.log(JSON.stringify({ ...summary, written: false }, null, 2));
    return;
  }
  await writeFile(`${path}.bak`, original, "utf8");
  await writeFile(path, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  await writeFile(AUTHORED_MODULE_PATH, authoredModule(waves), "utf8");
  // Formatted here rather than left for the gate to catch: a generated file that
  // fails `format:check` on the run that produced it is a trap.
  await promisify(execFile)(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    ["exec", "prettier", "--write", AUTHORED_MODULE_PATH],
    { shell: process.platform === "win32" }
  );
  console.log(JSON.stringify({ ...summary, written: true }, null, 2));
}

await main();
