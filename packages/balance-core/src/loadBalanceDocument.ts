import { balancePresetsFileSchema, type BalancePresetsFile } from "@spaceship-defender/protocol";

import { migrateBalanceDocument } from "./migrations.ts";
import { assertTuningIsPlayable } from "./simulationConfig.ts";

/**
 * What it takes for a balance document to be usable, in one place.
 *
 * The server reads it off a disk and a device reads it out of its own bundle,
 * and both have to answer the same question the same way: migrate whatever
 * arrived, hold it against the schema, then prove every preset in it can
 * actually drive a simulation. A second opinion on any of the three would mean
 * a file the server plays and the device refuses, or the other way round.
 *
 * The result is returned rather than thrown because the refusal is normal: a
 * caller falls back to built-in defaults and says why, it does not crash.
 */
export type BalanceDocumentResult =
  | { readonly ok: true; readonly document: BalancePresetsFile }
  | { readonly ok: false; readonly reason: "schema" | "unplayable"; readonly detail: string };

export function loadBalanceDocument(raw: unknown): BalanceDocumentResult {
  const parsed = balancePresetsFileSchema.safeParse(migrateBalanceDocument(raw));
  if (!parsed.success) {
    const detail = parsed.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
      .join("; ");
    return { ok: false, reason: "schema", detail };
  }

  try {
    for (const preset of parsed.data.presets) assertTuningIsPlayable(preset.tuning);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown reason";
    return { ok: false, reason: "unplayable", detail };
  }

  return { ok: true, document: parsed.data };
}
