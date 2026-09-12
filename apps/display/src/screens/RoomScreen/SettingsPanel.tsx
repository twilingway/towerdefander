import { useState, useSyncExternalStore } from "react";

import { audioBus } from "../../audio/AudioBus.js";
import type { AudioSettings } from "../../audio/mixer.js";
import { audioSettings, setAudioSettings, subscribeToAudioSettings } from "../../audio/settings.js";

/** A way out, when the screen that opened this panel has one to offer. */
export interface SettingsAction {
  readonly label: string;
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
        aria-label="Настройки"
        data-testid="settings-toggle"
        onClick={() => {
          setOpen((was) => !was);
          audioBus().resume();
        }}
      >
        {settings.muted ? "🔇" : "⚙"}
      </button>
      {/*
        The window's own chrome, and deliberately not `spaceship-hud`: in a
        fight that class is the bottom readout strip - absolute, pinned across
        the whole width, six columns and deaf to the mouse - which dragged this
        window to the floor of the screen the moment it was opened.
      */}
      {open && (
        <div className="settings__window" data-testid="settings-window">
          <label className="settings__row">
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
            <strong>{Math.round(settings.sounds * 100)}</strong>
          </label>
          <label className="settings__row">
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
            <strong>{Math.round(settings.music * 100)}</strong>
          </label>
          {/*
            Two switches rather than one "enemy sounds": the chatter of fifteen
            other guns is a different nuisance from the explosions, and a player
            who wants to hear kills without hearing every burst has to be able
            to say exactly that. Neither touches this ship's own voice.
          */}
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
          <button
            type="button"
            className={`settings__mute${settings.muted ? " settings__mute--on" : ""}`}
            aria-pressed={settings.muted}
            onClick={() => {
              change({ muted: !settings.muted });
            }}
          >
            {settings.muted ? "Включить звук" : "Mute"}
          </button>
          {action !== undefined && (
            <button
              type="button"
              className="settings__leave"
              data-testid="settings-leave"
              disabled={action.disabled}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
