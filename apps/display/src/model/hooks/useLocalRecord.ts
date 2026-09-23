import { useEffect, useRef, useState } from "react";

import { commitLocalRun, type LocalRecord } from "../localRun/personalBest.js";

/**
 * The device's best run, committed once when this one ends.
 *
 * Once, and that is the whole difficulty: the result screen stays up while the
 * crew decides on a rematch, so anything that writes on render would write the
 * same finished run over and over, and anything keyed on the object identity of
 * a result would do the same. The arguments are therefore the numbers rather
 * than a frame, and the latch clears when the run leaves its result phase.
 */
export function useLocalRecord(
  active: boolean,
  score: number,
  waveNumber: number
): LocalRecord | null {
  const [record, setRecord] = useState<LocalRecord | null>(null);
  const committed = useRef(false);

  useEffect(() => {
    if (!active) {
      committed.current = false;
      setRecord(null);
      return;
    }
    if (committed.current) return;
    committed.current = true;
    setRecord(commitLocalRun({ score, waveNumber }));
  }, [active, score, waveNumber]);

  return record;
}
