import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  BALANCE_FILE_VERSION,
  balancePresetsFileSchema,
  type BalancePreset,
  type BalancePresetsFile,
  type BalanceTuning
} from "@spaceship-defender/protocol";
import {
  createSpaceshipSimulationConfig,
  validateSpaceshipSimulationConfig,
  type SpaceshipSimulationConfig
} from "@spaceship-defender/game-core";

const DEFAULT_PRESET_ID = "default";

export function createDefaultTuning(): BalanceTuning {
  const config = createSpaceshipSimulationConfig();
  return {
    enemyArchetypes: config.enemyArchetypes,
    waveCampaign: config.waveCampaign,
    enemySpawnIntervalTicks: config.enemySpawnIntervalTicks,
    intermissionTicks: config.intermissionTicks,
    ambientAsteroidIntervalMinTicks: config.ambientAsteroidIntervalMinTicks,
    ambientAsteroidIntervalMaxTicks: config.ambientAsteroidIntervalMaxTicks,
    asteroidHp: config.asteroidHp,
    asteroidRadius: config.asteroidRadius,
    asteroidSpeedPerSecond: config.asteroidSpeedPerSecond,
    asteroidLifetimeTicks: config.asteroidLifetimeTicks,
    asteroidDamage: config.asteroidDamage,
    asteroidShieldHitCost: config.asteroidShieldHitCost,
    asteroidSpawnCost: config.asteroidSpawnCost,
    asteroidScoreReward: config.asteroidScoreReward,
    asteroidCreditReward: config.asteroidCreditReward,
    missileInterceptScoreReward: config.missileInterceptScoreReward
  };
}

export function createDefaultPresetsFile(): BalancePresetsFile {
  return {
    version: BALANCE_FILE_VERSION,
    activePresetId: DEFAULT_PRESET_ID,
    presets: [{ id: DEFAULT_PRESET_ID, name: "Базовый баланс", tuning: createDefaultTuning() }]
  };
}

/** Throws a RangeError when the tuning cannot drive a simulation. */
export function assertTuningIsPlayable(tuning: BalanceTuning): void {
  validateSpaceshipSimulationConfig(createSpaceshipSimulationConfig(tuning));
}

export function toSimulationConfig(tuning: BalanceTuning): SpaceshipSimulationConfig {
  return createSpaceshipSimulationConfig(tuning);
}

function findActivePreset(file: BalancePresetsFile): BalancePreset {
  // The schema guarantees the active id resolves, so this only guards hand-built values.
  const active = file.presets.find(({ id }) => id === file.activePresetId) ?? file.presets[0];
  if (active === undefined) {
    throw new Error("Balance document must contain at least one preset.");
  }
  return active;
}

export interface BalanceStoreOptions {
  readonly filePath: string;
  readonly logger?: Pick<Console, "warn">;
}

export class BalanceStore {
  private readonly filePath: string;
  private readonly logger: Pick<Console, "warn">;
  private file: BalancePresetsFile = createDefaultPresetsFile();

  constructor({ filePath, logger = console }: BalanceStoreOptions) {
    this.filePath = filePath;
    this.logger = logger;
  }

  /** Reads the preset file once; a missing or broken file leaves defaults in place. */
  async load(): Promise<void> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch {
      this.logger.warn(
        `Balance preset file ${this.filePath} is unavailable; using built-in defaults.`
      );
      return;
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      this.logger.warn(
        `Balance preset file ${this.filePath} is not valid JSON; using built-in defaults.`
      );
      return;
    }

    const parsed = balancePresetsFileSchema.safeParse(parsedJson);
    if (!parsed.success) {
      this.logger.warn(
        `Balance preset file ${this.filePath} failed validation; using built-in defaults.`
      );
      return;
    }

    try {
      for (const preset of parsed.data.presets) assertTuningIsPlayable(preset.tuning);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown reason";
      this.logger.warn(
        `Balance preset file ${this.filePath} cannot drive a simulation (${reason}); using built-in defaults.`
      );
      return;
    }

    this.file = parsed.data;
  }

  getState(): BalancePresetsFile {
    return this.file;
  }

  getActiveTuning(): BalanceTuning {
    return findActivePreset(this.file).tuning;
  }

  getActiveSimulationConfig(): SpaceshipSimulationConfig {
    return toSimulationConfig(this.getActiveTuning());
  }

  /** Validates, writes atomically and only then swaps the in-memory state. */
  async save(next: BalancePresetsFile): Promise<void> {
    const parsed = balancePresetsFileSchema.parse(next);
    for (const preset of parsed.presets) assertTuningIsPlayable(preset.tuning);
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = join(
      dirname(this.filePath),
      `.${String(process.pid)}-${String(Date.now())}.balance.tmp`
    );
    await writeFile(temporaryPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
    await rename(temporaryPath, this.filePath);
    this.file = parsed;
  }
}
