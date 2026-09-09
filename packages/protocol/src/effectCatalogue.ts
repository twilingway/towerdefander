/**
 * The baked effects a preset may name.
 *
 * Only identity lives here; the atlases and their grids live in
 * `packages/fx-assets`, which is a client package the server never sees. The
 * server is what validates a preset, so the list of legal ids has to be
 * somewhere both sides share - the same split `visualCatalog.ts` already makes
 * between an asset id and the geometry drawn for it.
 *
 * `fx-assets` does not declare its own list: its test asserts the baked
 * manifest matches these tuples, so baking an effect and forgetting to name it
 * here fails rather than producing an atlas nothing can reference.
 */

/**
 * Every baked effect, in catalogue order. A literal tuple so the balance schema
 * can be a `z.enum`.
 */
export const FX_EFFECT_IDS = [
  "plasma-exhaust",
  "muzzle-flash",
  "muzzle-flash-mg",
  "explosion",
  "debris-burst"
] as const;
export type FxEffectId = (typeof FX_EFFECT_IDS)[number];

/**
 * The ones that may be hung on an event.
 *
 * A subset on purpose: `plasma-exhaust` is a loop, and a loop in a one-shot
 * slot would either play forever or be cut off mid-cycle. Adding a one-shot
 * effect therefore means naming it twice, which is the point - the second
 * mention is where somebody decides it makes sense as an event.
 */
export const FX_EVENT_EFFECT_IDS = [
  "muzzle-flash",
  "muzzle-flash-mg",
  "explosion",
  "debris-burst"
] as const;
export type FxEventEffectId = (typeof FX_EVENT_EFFECT_IDS)[number];
