// Kept in its own module so balance schemas can read it without importing the
// protocol barrel, which would leave this constant in the temporal dead zone.
export const ENEMY_KINDS = ["gunship", "missileCarrier", "sniper", "interceptor", "boss"] as const;
