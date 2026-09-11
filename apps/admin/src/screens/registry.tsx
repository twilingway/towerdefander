import type { ReactElement } from "react";
import type { BalancePresetsFile, BalanceTuning } from "@spaceship-defender/protocol";

import { ArenaScreen } from "./ArenaScreen/index.js";
import { AutopilotScreen } from "./AutopilotScreen/index.js";
import { DirectorScreen } from "./DirectorScreen/index.js";
import { EffectsScreen } from "./EffectsScreen/index.js";
import { EnemiesScreen } from "./EnemiesScreen/index.js";
import { EnemySkillScreen } from "./EnemySkillScreen/index.js";
import { HelmScreen } from "./HelmScreen/index.js";
import { PlayerScreen } from "./PlayerScreen/index.js";
import { PresetsScreen } from "./PresetsScreen/index.js";
import { ShipsScreen } from "./ShipsScreen/index.js";
import { StatsScreen } from "./StatsScreen/index.js";
import { WavesScreen } from "./WavesScreen/index.js";

export const TABS = [
  "waves",
  "enemies",
  "enemySkill",
  "player",
  "ships",
  "effects",
  "helm",
  "autopilot",
  "director",
  "arena",
  "stats",
  "presets"
] as const;
export type Tab = (typeof TABS)[number];

export const TAB_LABELS: Record<Tab, string> = {
  waves: "Волны",
  enemies: "Враги",
  enemySkill: "ИИ врага",
  player: "Игрок",
  ships: "Корабли",
  effects: "Эффекты",
  helm: "Управление",
  autopilot: "Автопилот",
  director: "Директор",
  arena: "Арена",
  stats: "Статистика",
  presets: "Пресеты"
};

/**
 * Which game a tab belongs to.
 *
 * Two modes share one console, and most of what is tuned here is shared with
 * them - the hulls, the effects, the helm, the presets. What is not shared is
 * worth separating, because "waves" means nothing in the arena and "zones"
 * means nothing in the campaign.
 */
export const TAB_GROUPS = ["campaign", "arena", "common"] as const;
export type TabGroup = (typeof TAB_GROUPS)[number];

export const TAB_GROUP_LABELS: Record<TabGroup, string> = {
  campaign: "Кампания",
  arena: "Арена",
  common: "Общее"
};

export const TAB_GROUP_OF: Record<Tab, TabGroup> = {
  waves: "campaign",
  enemies: "campaign",
  enemySkill: "campaign",
  director: "campaign",
  arena: "arena",
  player: "common",
  ships: "common",
  effects: "common",
  helm: "common",
  autopilot: "common",
  stats: "common",
  presets: "common"
};

/**
 * The path segment each tab answers on. Mostly the id, with one exception:
 * `/stats/` on this origin is proxied to the API (docker/nginx-admin.conf), so
 * the statistics tab answers on `/statistics` instead.
 */
export const TAB_PATHS: Record<Tab, string> = {
  waves: "waves",
  enemies: "enemies",
  enemySkill: "enemySkill",
  player: "player",
  ships: "ships",
  effects: "effects",
  helm: "helm",
  autopilot: "autopilot",
  director: "director",
  arena: "arena",
  stats: "statistics",
  presets: "presets"
};

/** Everything a tab may need; each entry below takes only its own slice. */
export interface ScreenContext {
  readonly document: BalancePresetsFile;
  /** The console's own credentials; the statistics tab calls the server itself. */
  readonly password: string;
  readonly tuning: BalanceTuning;
  readonly onTuningChange: (tuning: BalanceTuning) => void;
  readonly onDocumentChange: (document: BalancePresetsFile) => void;
  readonly onImportError: (message: string) => void;
}

/**
 * One entry per tab: adding a section means adding an id to `TABS`, a label and
 * a line here, and never touching the shell.
 */
export const SCREENS: Record<Tab, (context: ScreenContext) => ReactElement> = {
  waves: ({ tuning, onTuningChange }) => <WavesScreen tuning={tuning} onChange={onTuningChange} />,
  enemies: ({ tuning, onTuningChange }) => (
    <EnemiesScreen tuning={tuning} onChange={onTuningChange} />
  ),
  enemySkill: ({ tuning, onTuningChange }) => (
    <EnemySkillScreen tuning={tuning} onChange={onTuningChange} />
  ),
  player: ({ tuning, onTuningChange }) => (
    <PlayerScreen tuning={tuning} onChange={onTuningChange} />
  ),
  ships: ({ tuning, onTuningChange }) => <ShipsScreen tuning={tuning} onChange={onTuningChange} />,
  // No slice of the context: the catalogue reads the generated manifest, so
  // it needs neither the balance document nor the password.
  effects: () => <EffectsScreen />,
  helm: ({ tuning, onTuningChange }) => <HelmScreen tuning={tuning} onChange={onTuningChange} />,
  autopilot: ({ tuning, onTuningChange }) => (
    <AutopilotScreen tuning={tuning} onChange={onTuningChange} />
  ),
  director: ({ tuning, onTuningChange }) => (
    <DirectorScreen tuning={tuning} onChange={onTuningChange} />
  ),
  arena: ({ tuning, onTuningChange }) => <ArenaScreen tuning={tuning} onChange={onTuningChange} />,
  stats: ({ document, password }) => <StatsScreen document={document} password={password} />,
  presets: ({ document, onDocumentChange, onImportError }) => (
    <PresetsScreen document={document} onChange={onDocumentChange} onImportError={onImportError} />
  )
};
