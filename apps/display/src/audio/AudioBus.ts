import { SOUND_IDS, type MusicTrackId, type SoundId } from "@spaceship-defender/protocol";

import { musicSources, soundUrl } from "./catalogue.js";
import {
  AUDIBLE_FLOOR,
  busGain,
  channelAllowed,
  createSoundThrottle,
  distanceGain,
  type AudioSettings,
  type SoundChannel,
  type SoundThrottle
} from "./mixer.js";
import { audioSettings, subscribeToAudioSettings } from "./settings.js";

/** Where the event happened and where the camera is, so the two can be compared. */
export interface SoundPlacement {
  readonly x: number;
  readonly y: number;
  readonly listenerX: number;
  readonly listenerY: number;
  readonly frameWidth: number;
  /** Whose voice this is; see `SoundChannel`. Absent counts as the crew's own. */
  readonly channel?: SoundChannel;
}

/**
 * How many copies of one sound may be sounding at once, and how close together
 * two of them may start.
 *
 * The cap is about the mixer, not about the game: past it the oldest copy is
 * stopped rather than the newest refused, so a gun that fires faster is simply
 * heard firing faster - which is what has to hold when its rate of fire becomes
 * something a crew upgrades. The gap only protects against a frame that spends
 * several banked shots at once, which is one shot played four times, not four.
 */
const MAX_VOICES = 6;
const MIN_GAP_MS = 25;

/**
 * The one speaker in the room.
 *
 * Two different mechanisms, because the two kinds of sound have opposite needs.
 * An event has to start on the frame it happened, so it is a decoded buffer in
 * memory and a gain node; a theme is a hundred seconds of stereo, which decoded
 * would be tens of megabytes of it, so it streams through a plain audio element
 * that starts playing long before the file has arrived.
 *
 * Not a Phaser sound manager for the same reason: the theme has to survive the
 * scene being rebuilt, and the volume control lives in React, outside the game
 * entirely.
 */
export class AudioBus {
  private context: AudioContext | undefined;
  private sfxGain: GainNode | undefined;
  private readonly buffers = new Map<SoundId, AudioBuffer>();
  private readonly pending = new Set<SoundId>();
  private readonly throttle: SoundThrottle = createSoundThrottle({ minGapMs: MIN_GAP_MS });
  /** What is sounding right now, per id and in the order it started. */
  private readonly voices = new Map<SoundId, AudioBufferSourceNode[]>();
  private music: HTMLAudioElement | undefined;
  private musicTrack: MusicTrackId | undefined;
  private settings: AudioSettings = audioSettings();
  private stopListening: (() => void) | undefined;

  constructor() {
    this.stopListening = subscribeToAudioSettings((settings) => {
      this.settings = settings;
      this.applySettings();
    });
    /*
     * The first touch of the session is what a browser waits for before it
     * lets a page make any sound at all. Anything counts - a button, a key,
     * the stick - so the cheapest place to catch it is the document, once.
     */
    if (typeof document !== "undefined") {
      const unlock = () => {
        this.resume();
      };
      document.addEventListener("pointerdown", unlock, { once: true });
      document.addEventListener("keydown", unlock, { once: true });
    }
  }

  /**
   * A browser will not make a sound until somebody has clicked something, and
   * the promise it rejects with is the only way to find out. So the first
   * gesture of the session is what starts the device - and a theme that was
   * asked for before it is remembered and started here.
   */
  resume(): void {
    const context = this.ensureContext();
    if (context.state === "suspended") void context.resume();
    this.preload();
    const music = this.music;
    if (music?.paused === true) void music.play().catch(() => undefined);
  }

  /** Plays one event, if it is worth hearing from where the camera is. */
  play(id: SoundId | undefined, placement?: SoundPlacement): void {
    if (id === undefined) return;
    if (!channelAllowed(this.settings, placement?.channel ?? "own")) return;
    const bus = busGain(this.settings, "sounds");
    if (bus <= 0) return;
    const distance =
      placement === undefined
        ? 1
        : distanceGain(
            Math.hypot(placement.x - placement.listenerX, placement.y - placement.listenerY),
            placement.frameWidth
          );
    const gain = bus * distance;
    if (gain < AUDIBLE_FLOOR) return;

    const context = this.ensureContext();
    const buffer = this.buffers.get(id);
    if (buffer === undefined) {
      void this.load(id);
      return;
    }
    if (context.state === "suspended") return;
    if (!this.throttle.take(id, context.currentTime * 1_000)) return;

    /*
     * Room for the new copy is made by stopping the oldest, never by refusing
     * the new one. A shot that happened has to be heard; which of the copies
     * already fading out gets cut short is nobody's decision to notice.
     */
    const live = this.voices.get(id) ?? [];
    while (live.length >= MAX_VOICES) live.shift()?.stop();

    const voice = context.createGain();
    // The listener's own volume is on the bus; this one is only the distance,
    // so moving the slider moves everything already sounding with it.
    voice.gain.value = distance;
    voice.connect(this.sfxGain ?? context.destination);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(voice);
    source.addEventListener("ended", () => {
      const playing = this.voices.get(id);
      if (playing !== undefined) {
        const at = playing.indexOf(source);
        if (at >= 0) playing.splice(at, 1);
      }
      voice.disconnect();
    });
    live.push(source);
    this.voices.set(id, live);
    source.start();
  }

  /**
   * Fetches and decodes everything, so the first shot is heard.
   *
   * Loading on first use means the first of every sound is the one that goes
   * missing - and the first cannon shot of a match is exactly the one a player
   * is listening for. The whole catalogue is under two hundred kilobytes, so
   * there is nothing to be clever about.
   */
  preload(): void {
    for (const id of SOUND_IDS) {
      if (!this.buffers.has(id)) void this.load(id);
    }
  }

  /** Switches the theme, or stops it when handed nothing. One plays at a time. */
  playMusic(track: MusicTrackId | undefined): void {
    if (track === this.musicTrack) return;
    this.musicTrack = track;
    this.music?.pause();
    if (track === undefined) {
      this.music = undefined;
      return;
    }
    const element = document.createElement("audio");
    for (const source of musicSources(track)) {
      const node = document.createElement("source");
      node.src = source.src;
      node.type = source.type;
      element.append(node);
    }
    element.loop = true;
    element.preload = "auto";
    element.volume = busGain(this.settings, "music");
    this.music = element;
    // Rejected before the first gesture; `resume` starts it then.
    void element.play().catch(() => undefined);
  }

  destroy(): void {
    this.stopListening?.();
    this.stopListening = undefined;
    this.music?.pause();
    this.music = undefined;
    this.musicTrack = undefined;
    void this.context?.close();
    this.context = undefined;
    this.sfxGain = undefined;
    this.buffers.clear();
    this.voices.clear();
  }

  private applySettings(): void {
    if (this.sfxGain !== undefined) this.sfxGain.gain.value = busGain(this.settings, "sounds");
    if (this.music !== undefined) this.music.volume = busGain(this.settings, "music");
  }

  private ensureContext(): AudioContext {
    const existing = this.context;
    if (existing !== undefined) return existing;
    const context = new AudioContext();
    const gain = context.createGain();
    gain.gain.value = busGain(this.settings, "sounds");
    gain.connect(context.destination);
    this.context = context;
    this.sfxGain = gain;
    return context;
  }

  private async load(id: SoundId): Promise<void> {
    if (this.pending.has(id)) return;
    this.pending.add(id);
    try {
      const url = soundUrl(id);
      if (url === undefined) return;
      const response = await fetch(url);
      const bytes = await response.arrayBuffer();
      const buffer = await this.ensureContext().decodeAudioData(bytes);
      this.buffers.set(id, buffer);
    } catch {
      // A sound that will not load is a sound that does not play. The field is
      // still readable without it, and retrying every frame is not.
      this.buffers.delete(id);
    } finally {
      this.pending.delete(id);
    }
  }
}

let shared: AudioBus | undefined;

/** There is one set of speakers, so there is one bus. */
export function audioBus(): AudioBus {
  shared ??= new AudioBus();
  return shared;
}
