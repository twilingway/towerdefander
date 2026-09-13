/**
 * What the listener has set, and nothing about how it is played.
 *
 * Two buses rather than one volume, because the two are different decisions: a
 * room that wants the fight loud usually wants the theme quiet, and the Mute is
 * the third, which answers "somebody is on the phone" without losing either.
 */
export interface AudioSettings {
  readonly sounds: number;
  readonly music: number;
  /**
   * Silence per bus rather than one master switch.
   *
   * The two are asked for separately - "turn the music off" is a different
   * sentence from "quiet, somebody is on the phone" - and a mute that sits
   * against the slider it silences needs no label to explain which is which.
   */
  readonly soundsMuted: boolean;
  readonly musicMuted: boolean;
  /**
   * Whether the rest of the field is heard, split the way it is complained
   * about: the chatter of fifteen other guns is a different nuisance from the
   * explosions, and a player who wants to hear kills without hearing every
   * burst has to be able to say so.
   */
  readonly enemyShots: boolean;
  readonly enemyDeaths: boolean;
}

/**
 * Half on both, which is the only honest default.
 *
 * A first run has to be audible without being a decision anybody regrets, and
 * the middle of the slider is also where a listener can tell in which direction
 * to move it. Anything cleverer is a guess about a room this code has never
 * been in.
 */
export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  sounds: 0.5,
  music: 0.5,
  soundsMuted: false,
  musicMuted: false,
  enemyShots: true,
  enemyDeaths: true
};

/**
 * Which of the field's voices this is.
 *
 * `own` is this ship and everything the player did; the other two are what the
 * rest of the field is doing, and each can be switched off on its own.
 */
export type SoundChannel = "own" | "enemyShot" | "enemyDeath";

/** Whether a channel is heard at all, before any volume is worked out. */
export function channelAllowed(settings: AudioSettings, channel: SoundChannel): boolean {
  if (channel === "enemyShot") return settings.enemyShots;
  if (channel === "enemyDeath") return settings.enemyDeaths;
  return true;
}

/** What a bus is actually worth once the Mute has had its say. */
export function busGain(settings: AudioSettings, bus: "sounds" | "music"): number {
  if (bus === "sounds") return settings.soundsMuted ? 0 : clamp01(settings.sounds);
  return settings.musicMuted ? 0 : clamp01(settings.music);
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * How loud an event is from where the camera is standing.
 *
 * Generous on purpose, and further than the picture: hearing a fight start
 * somewhere off screen is information a pilot wants - it is the only warning
 * that a crowd has found each other, or you. Full inside the frame's own
 * half-width, fading to nothing a frame beyond it.
 *
 * Whether the rest of the field is heard at all is a different question, and
 * the one the settings window answers: the channel is checked before any of
 * this, so switching enemies off is silence rather than a quieter rattle.
 */
export function distanceGain(distance: number, frameWidth: number): number {
  const inside = Math.max(1, frameWidth / 2);
  if (distance <= inside) return 1;
  const reach = inside * 2;
  if (distance >= reach) return 0;
  return 1 - (distance - inside) / (reach - inside);
}

/** A sound that would come out quieter than this is not started at all. */
export const AUDIBLE_FLOOR = 0.02;

export interface SoundThrottleOptions {
  /** How close together two copies of one sound may start, in milliseconds. */
  readonly minGapMs: number;
}

export interface SoundThrottle {
  take: (id: string, nowMs: number) => boolean;
}

/**
 * The only thing a weapon sound may be refused for: having just been played.
 *
 * An earlier version capped live copies and refused anything past the cap,
 * which is wrong for a gun. A shot is an event that happened - refusing it
 * makes the weapon silent exactly when it is firing fastest, and the faster the
 * cannon is upgraded the more of its shots disappear. The cap belongs on how
 * many copies keep sounding, not on how many may start: the bus stops its own
 * oldest copy instead, so a new shot always gets a voice.
 *
 * What stays is a floor on how close together two starts may be. Several shots
 * can be banked into one drawn frame, and four copies of one sample started
 * within a millisecond of each other is not four shots - it is one shot, four
 * times as loud, with the comb filtering that comes free.
 */
export function createSoundThrottle({ minGapMs }: SoundThrottleOptions): SoundThrottle {
  const lastStart = new Map<string, number>();
  return {
    take(id, nowMs) {
      const started = lastStart.get(id);
      if (started !== undefined && nowMs - started < minGapMs) return false;
      lastStart.set(id, nowMs);
      return true;
    }
  };
}
