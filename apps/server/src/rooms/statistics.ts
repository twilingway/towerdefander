/** Latency samples are summarised by median so one stalled probe cannot skew it. */
export function median(values: readonly number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  const upper = ordered[middle];
  if (upper === undefined) return -1;
  if (ordered.length % 2 === 1) return upper;
  const lower = ordered[middle - 1];
  return lower === undefined ? upper : Math.round((lower + upper) / 2);
}
