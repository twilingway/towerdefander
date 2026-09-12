import { clamp01, DEFAULT_AUDIO_SETTINGS, type AudioSettings } from "./mixer.js";

/**
 * Where the listener's own numbers live: this browser, and nowhere else.
 *
 * Volume is a property of the room the screen stands in - colanders on one
 * stand, a laptop on a kitchen table on another - so it is not balance, not
 * preset, and never travels to the server. That also means it cannot break a
 * match or need an administrator.
 */
const KEY = "spaceship-defender:audio";

type Listener = (settings: AudioSettings) => void;

let current = read();
const listeners = new Set<Listener>();

export function audioSettings(): AudioSettings {
  return current;
}

export function setAudioSettings(next: Partial<AudioSettings>): AudioSettings {
  current = {
    sounds: clamp01(next.sounds ?? current.sounds),
    music: clamp01(next.music ?? current.music),
    soundsMuted: next.soundsMuted ?? current.soundsMuted,
    musicMuted: next.musicMuted ?? current.musicMuted,
    enemyShots: next.enemyShots ?? current.enemyShots,
    enemyDeaths: next.enemyDeaths ?? current.enemyDeaths
  };
  write(current);
  for (const listener of listeners) listener(current);
  return current;
}

/** For `useSyncExternalStore`, and for the bus, which follows the same store. */
export function subscribeToAudioSettings(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/*
 * Storage may be absent, full, or refused outright - a private window throws on
 * the getter itself. None of that is a reason not to have sound, so every read
 * falls back to the defaults and every write is allowed to fail silently.
 */
/**
 * The store, when there is one.
 *
 * Typed as possibly absent because it genuinely is: a test runs in node, where
 * the global does not exist at all, and a locked-down browser throws on the
 * getter rather than returning nothing. The declared type says neither.
 */
function storage(): Storage | undefined {
  try {
    // Read off the global by name rather than as a property of a typed
    // `globalThis`: the lib declares it as always present, which is the very
    // thing being checked for.
    const global = globalThis as { localStorage?: Storage };
    return global.localStorage;
  } catch {
    return undefined;
  }
}

function read(): AudioSettings {
  try {
    const raw = storage()?.getItem(KEY);
    if (raw === null || raw === undefined) return DEFAULT_AUDIO_SETTINGS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_AUDIO_SETTINGS;
    // `muted` is not a field any more; it is what the old build wrote, and this
    // is the only place that still has to know the word.
    const value = parsed as Partial<Record<keyof AudioSettings | "muted", unknown>>;
    return {
      sounds:
        typeof value.sounds === "number" ? clamp01(value.sounds) : DEFAULT_AUDIO_SETTINGS.sounds,
      music: typeof value.music === "number" ? clamp01(value.music) : DEFAULT_AUDIO_SETTINGS.music,
      /*
       * One switch became two. A document written by the old build carries
       * `muted`, which silenced both, so that is what it still means here.
       */
      soundsMuted: value.soundsMuted === true || value.muted === true,
      musicMuted: value.musicMuted === true || value.muted === true,
      // Absent means on: a stored document written before these existed must
      // not silence half the field on the next page load.
      enemyShots: value.enemyShots !== false,
      enemyDeaths: value.enemyDeaths !== false
    };
  } catch {
    return DEFAULT_AUDIO_SETTINGS;
  }
}

function write(settings: AudioSettings): void {
  try {
    storage()?.setItem(KEY, JSON.stringify(settings));
  } catch {
    // A listener who cannot save their volume still gets to set it.
  }
}
