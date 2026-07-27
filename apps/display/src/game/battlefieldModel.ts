import type { PublicAirstrikeEffect, PublicGameSnapshot } from "@town-defenders/protocol";

export interface BattlefieldFrame {
  readonly snapshot: PublicGameSnapshot;
  readonly airstrikeEffect: PublicAirstrikeEffect | null;
}

export class BattlefieldSnapshotFeed {
  private initialized = false;
  private lastAirstrikeSequence = 0;

  prepareHydration(): void {
    this.initialized = false;
  }

  next(snapshot: PublicGameSnapshot): BattlefieldFrame {
    const currentSequence = snapshot.lastAirstrikeEffect?.sequence ?? 0;
    if (!this.initialized) {
      this.initialized = true;
      this.lastAirstrikeSequence = currentSequence;
      return { snapshot, airstrikeEffect: null };
    }

    const airstrikeEffect =
      snapshot.lastAirstrikeEffect !== null && currentSequence > this.lastAirstrikeSequence
        ? snapshot.lastAirstrikeEffect
        : null;
    this.lastAirstrikeSequence = Math.max(this.lastAirstrikeSequence, currentSequence);
    return { snapshot, airstrikeEffect };
  }
}
