import { schema, t } from "@colyseus/schema";

/**
 * One frame of a solo pilot's intent.
 *
 * Flat primitives only, and everything the ship's step reads has to be here:
 * that is the condition under which a client may replay a frame the server has
 * not acknowledged yet and arrive where the room did.
 *
 * It carries both halves of the cockpit because a solo connection owns both -
 * the helm and the gun are one pair of hands, acknowledged together. Crew
 * panels keep their three separate messages; they have no ship of their own to
 * predict.
 *
 * Nullable intents travel as a flag beside a number rather than as a sentinel.
 * Zero is a real command at this helm - "stop turning" - and could not stand
 * for "no command given".
 */
export const SoloInput = schema(
  {
    /** Monotonic per connection. The server dedupes on it; the client acks by it. */
    seq: t.uint32().default(0),
    /**
     * Which set of drive numbers this frame was given under.
     *
     * Straight from the lab, which rides a profile index on every input frame:
     * replaying an old input against new numbers drifts for as long as the
     * numbers keep moving, and ours move whenever a module is bought.
     */
    driveRevision: t.uint16().default(0),
    /** Stick drive: a bearing and a throttle in one vector. */
    vectorX: t.float32().default(0),
    vectorY: t.float32().default(0),
    /** Tank helm. Absent - not zero - when the stick is driving instead. */
    hasHelm: t.boolean().default(false),
    turn: t.float32().default(0),
    thrust: t.float32().default(0),
    /** Where the gun is pointed, as a unit bearing. */
    aimX: t.float32().default(0),
    aimY: t.float32().default(0),
    /** A traverse rate instead of a bearing; zero means stop, so it needs its flag. */
    hasAimTurn: t.boolean().default(false),
    aimTurn: t.float32().default(0),
    mgFiring: t.boolean().default(false),
    firing: t.boolean().default(false)
  },
  "SoloInput"
);
export type SoloInput = InstanceType<typeof SoloInput>;

/**
 * Ranges the room clamps every frame into, in place, before anything reads it.
 *
 * Not anti-cheat - the server still owns every outcome - but NaN containment:
 * one NaN reaching the step poisons the ship's position permanently, and it
 * vanishes for everyone with no error anywhere. A clamp turns a malformed value
 * into a legal one instead.
 */
export const SOLO_INPUT_RANGES = {
  vectorX: [-1, 1],
  vectorY: [-1, 1],
  turn: [-1, 1],
  thrust: [-1, 1],
  aimX: [-1, 1],
  aimY: [-1, 1],
  aimTurn: [-1, 1]
} as const;

/** About a second of frames at the rate a cockpit sends them. */
export const SOLO_INPUT_BUFFER_SIZE = 64;
