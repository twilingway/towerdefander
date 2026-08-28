import type { ReactElement } from "react";
import type { BalancePresetsFile, BalanceTuning } from "@spaceship-defender/protocol";

import { AutopilotScreen } from "./AutopilotScreen/index.js";
import { DirectorScreen } from "./DirectorScreen/index.js";
import { EnemiesScreen } from "./EnemiesScreen/index.js";
import { HelmScreen } from "./HelmScreen/index.js";
import { PlayerScreen } from "./PlayerScreen/index.js";
import { PresetsScreen } from "./PresetsScreen/index.js";
import { WavesScreen } from "./WavesScreen/index.js";

export const TABS = [
  "waves",
  "enemies",
  "player",
  "helm",
  "autopilot",
  "director",
  "presets"
] as const;
export type Tab = (typeof TABS)[number];

export const TAB_LABELS: Record<Tab, string> = {
  waves: "Волны",
  enemies: "Враги",
  player: "Игрок",
  helm: "Управление",
  autopilot: "Автопилот",
  director: "Директор",
  presets: "Пресеты"
};

/** Everything a tab may need; each entry below takes only its own slice. */
export interface ScreenContext {
  readonly document: BalancePresetsFile;
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
  player: ({ tuning, onTuningChange }) => (
    <PlayerScreen tuning={tuning} onChange={onTuningChange} />
  ),
  helm: ({ tuning, onTuningChange }) => <HelmScreen tuning={tuning} onChange={onTuningChange} />,
  autopilot: ({ tuning, onTuningChange }) => (
    <AutopilotScreen tuning={tuning} onChange={onTuningChange} />
  ),
  director: ({ tuning, onTuningChange }) => (
    <DirectorScreen tuning={tuning} onChange={onTuningChange} />
  ),
  presets: ({ document, onDocumentChange, onImportError }) => (
    <PresetsScreen document={document} onChange={onDocumentChange} onImportError={onImportError} />
  )
};
