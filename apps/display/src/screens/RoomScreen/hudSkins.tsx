import type { HudSkin } from "@spaceship-defender/protocol";
import type { ComponentType } from "react";

import {
  ArenaHudPanel,
  ArenaInfoFramePanel,
  BattleHudPanel,
  CountdownPanel,
  InfoFramePanel,
  ScanFramePanel,
  StatusFramePanel,
  TimerFramePanel
} from "./panels.js";

interface ScanProps {
  readonly onScan: () => void;
}

/** The panels one HUD skin puts over the fight. */
export interface HudSkinParts {
  readonly CampaignHeader: ComponentType;
  readonly ArenaHeader: ComponentType<ScanProps>;
  readonly Countdown: ComponentType;
  /** A panel of its own for the gauges; the classic HUD keeps them in the header and on the dial. */
  readonly Status: ComponentType | null;
  /** The match's sweep as its own button; the classic HUD keeps it in the match header. */
  readonly Scan: ComponentType<ScanProps> | null;
}

/**
 * Each skin as a row, not a branch: the battle stage asks the table which panels
 * to mount, and a third skin is a third row.
 */
export const HUD_SKIN_PARTS: Readonly<Record<HudSkin, HudSkinParts>> = {
  classic: {
    CampaignHeader: BattleHudPanel,
    ArenaHeader: ArenaHudPanel,
    Countdown: CountdownPanel,
    Status: null,
    Scan: null
  },
  frame: {
    CampaignHeader: InfoFramePanel,
    ArenaHeader: ArenaInfoFramePanel,
    Countdown: TimerFramePanel,
    Status: StatusFramePanel,
    Scan: ScanFramePanel
  }
};
