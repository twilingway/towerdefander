import { useState, useSyncExternalStore } from "react";

import { audioBus } from "../../audio/AudioBus.js";
import { ConfirmButton } from "./ConfirmButton.js";
import type { AudioSettings } from "../../audio/mixer.js";
import { audioSettings, setAudioSettings, subscribeToAudioSettings } from "../../audio/settings.js";
import {
  autoFullscreenEnabled,
  fullscreenSupported,
  isFullscreen,
  setAutoFullscreen,
  subscribeToAutoFullscreen,
  subscribeToFullscreen,
  toggleFullscreen
} from "../../model/fullscreen.js";
import type { QualityChoice, QualityLevel } from "../../game/quality.js";
import {
  activeQuality,
  qualityChoice,
  setQualityChoice,
  subscribeToQuality
} from "../../model/graphicsQuality.js";

/** What each level is called where a player picks it. */
const QUALITY_LABELS: Readonly<Record<QualityLevel, string>> = {
  high: "Высокое",
  mid: "Среднее",
  low: "Низкое, 30 к/с"
};

/** A way out, when the screen that opened this panel has one to offer. */
export interface SettingsAction {
  readonly label: string;
  /** What the button says once it is armed; see `ConfirmButton`. */
  readonly confirmLabel: string;
  readonly onClick: () => void;
  readonly disabled: boolean;
}

/**
 * Everything that is not the fight, behind one gear.
 *
 * A game on a shared screen in a room with people in it needs a way to be told
 * to be quiet that is one press away and does not touch the fight - and the way
 * out belongs behind the same press rather than beside the readouts a pilot is
 * reading, where a red button is the brightest thing on the screen and the one
 * they least want to hit.
 */
export function SettingsPanel({ action }: { readonly action?: SettingsAction }) {
  const settings = useSyncExternalStore(subscribeToAudioSettings, audioSettings, audioSettings);
  // The browser owns this one, and it changes without us: Escape leaves full
  // screen, and the button has to come back saying so.
  const full = useSyncExternalStore(subscribeToFullscreen, isFullscreen, () => false);
  const auto = useSyncExternalStore(subscribeToAutoFullscreen, autoFullscreenEnabled, () => true);
  const quality = useSyncExternalStore(subscribeToQuality, qualityChoice, () => "auto" as const);
  const activeLevel = useSyncExternalStore(subscribeToQuality, activeQuality, () => undefined);
  const [open, setOpen] = useState(false);

  /*
   * Every press is also the gesture the browser is waiting for: a page may not
   * make a sound until somebody has touched it, and this control is the one
   * thing a listener is guaranteed to touch before complaining about volume.
   */
  const change = (next: Partial<AudioSettings>) => {
    setAudioSettings(next);
    audioBus().resume();
  };

  return (
    <div className="settings">
      <button
        type="button"
        className="settings__toggle"
        aria-expanded={open}
        data-remote-skip
        aria-label="Настройки"
        data-testid="settings-toggle"
        onClick={() => {
          setOpen((was) => !was);
          audioBus().resume();
        }}
      >
        {settings.soundsMuted && settings.musicMuted ? "🔇" : "⚙"}
      </button>
      {/*
        The window's own chrome, and deliberately not `spaceship-hud`: in a
        fight that class is the bottom readout strip - absolute, pinned across
        the whole width, six columns and deaf to the mouse - which dragged this
        window to the floor of the screen the moment it was opened.
      */}
      {open && (
        <div className="settings__window" data-testid="settings-window">
          <div className="settings__row">
            <span>Звуки</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(settings.sounds * 100)}
              onChange={(event) => {
                change({ sounds: Number(event.target.value) / 100 });
              }}
            />
            {/* Against the slider it silences: which bus this switches off
              needs no label when it sits on the end of that bus's own row. */}
            <button
              type="button"
              className="settings__quiet"
              aria-label="Выключить звуки"
              aria-pressed={settings.soundsMuted}
              data-testid="settings-mute-sounds"
              onClick={() => {
                change({ soundsMuted: !settings.soundsMuted });
              }}
            >
              {settings.soundsMuted ? "🔇" : "🔊"}
            </button>
          </div>
          <div className="settings__row">
            <span>Музыка</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(settings.music * 100)}
              onChange={(event) => {
                change({ music: Number(event.target.value) / 100 });
              }}
            />
            <button
              type="button"
              className="settings__quiet"
              aria-label="Выключить музыку"
              aria-pressed={settings.musicMuted}
              data-testid="settings-mute-music"
              onClick={() => {
                change({ musicMuted: !settings.musicMuted });
              }}
            >
              {settings.musicMuted ? "🔇" : "🔊"}
            </button>
          </div>
          <label className="settings__row">
            <span>Графика</span>
            <select
              className="settings__select"
              data-testid="settings-quality"
              value={quality}
              onChange={(event) => {
                setQualityChoice(event.target.value as QualityChoice);
              }}
            >
              <option value="auto">
                {activeLevel === undefined ? "Авто" : `Авто (${QUALITY_LABELS[activeLevel]})`}
              </option>
              <option value="high">{QUALITY_LABELS.high}</option>
              <option value="mid">{QUALITY_LABELS.mid}</option>
              <option value="low">{QUALITY_LABELS.low}</option>
            </select>
          </label>
          <label className="settings__check">
            <input
              type="checkbox"
              checked={settings.enemyShots}
              onChange={(event) => {
                change({ enemyShots: event.target.checked });
              }}
            />
            <span>Выстрелы врагов</span>
          </label>
          <label className="settings__check">
            <input
              type="checkbox"
              checked={settings.enemyDeaths}
              onChange={(event) => {
                change({ enemyDeaths: event.target.checked });
              }}
            />
            <span>Взрывы врагов</span>
          </label>
          {fullscreenSupported() && (
            <label className="settings__check">
              <input
                type="checkbox"
                checked={auto}
                onChange={(event) => {
                  setAutoFullscreen(event.target.checked);
                }}
              />
              <span>Сразу на весь экран</span>
            </label>
          )}
          {fullscreenSupported() && (
            <button
              type="button"
              className="settings__action"
              data-testid="settings-fullscreen"
              onClick={() => {
                toggleFullscreen();
              }}
            >
              {full ? "Выйти из полного экрана" : "На весь экран"}
            </button>
          )}
          {action !== undefined && (
            <ConfirmButton
              className="settings__leave"
              testId="settings-leave"
              disabled={action.disabled}
              label={action.label}
              confirmLabel={action.confirmLabel}
              onConfirm={action.onClick}
            />
          )}
        </div>
      )}
    </div>
  );
}
