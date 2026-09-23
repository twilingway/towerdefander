import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  balancePresetsFileSchema,
  type BalancePresetsFile,
  type BalanceTuning
} from "@spaceship-defender/protocol";
import type { SpaceshipSimulationConfig } from "@spaceship-defender/game-core";
import {
  assertTuningIsPlayable,
  createDefaultPresetsFile,
  findActivePreset,
  loadBalanceDocument,
  toSimulationConfig
} from "@spaceship-defender/balance-core";

/*
 * The file half of the balance store. Everything that merely understands a
 * preset - defaults, migrations, the hull catalogue, the simulation config it
 * folds into - lives in `@spaceship-defender/balance-core`, because a browser
 * has to read the same document and cannot import `node:fs`.
 *
 * The re-exports below keep this module's public surface exactly as it was, so
 * the room, the routes and their tests do not learn that anything moved.
 */
export {
  assertTuningIsPlayable,
  createDefaultPresetsFile,
  createDefaultTuning,
  migrateBalanceDocument,
  resolveShipArchetype,
  toSimulationConfig,
  DEFAULT_CAMPAIGN_AUTHORING
} from "@spaceship-defender/balance-core";

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

    const loaded = loadBalanceDocument(parsedJson);
    if (!loaded.ok) {
      const what =
        loaded.reason === "schema"
          ? `failed validation (${loaded.detail})`
          : `cannot drive a simulation (${loaded.detail})`;
      this.logger.warn(`Balance preset file ${this.filePath} ${what}; using built-in defaults.`);
      await this.preserveUnusableFile(raw);
      return;
    }

    this.file = loaded.document;
  }

  /**
   * Keeps a copy of a preset the server could not use. Falling back to defaults
   * puts an empty campaign in front of the operator, and the next save from the
   * console writes that over hand-built waves — so the original has to survive
   * somewhere before that can happen.
   */
  private async preserveUnusableFile(raw: string): Promise<void> {
    const rescued = `${this.filePath}.unusable`;
    try {
      await writeFile(rescued, raw, "utf8");
      this.logger.warn(`Previous balance preset kept at ${rescued}.`);
    } catch {
      this.logger.warn(`Could not keep a copy of the unusable preset at ${rescued}.`);
    }
  }

  getState(): BalancePresetsFile {
    return this.file;
  }

  getActiveTuning(): BalanceTuning {
    return findActivePreset(this.file).tuning;
  }

  getActiveSimulationConfig(shipArchetypeId?: string): SpaceshipSimulationConfig {
    return toSimulationConfig(this.getActiveTuning(), shipArchetypeId);
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
