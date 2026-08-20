## 1. Protocol v4

- [ ] 1.1 Add shared capacity bounds, dynamic SectorId schemas, separate display/controller views,
      strict display create/join options and public collections up to six.
- [ ] 1.2 Add strict protocol boundary and cross-field schema tests for capacity, ordered sectors,
      enemies/effects, ordered/deduplicated player targets, projections and v3 mismatch.
- [ ] 1.3 Verify protocol with `pnpm --filter @town-defenders/protocol test` and
      `pnpm --filter @town-defenders/protocol typecheck`.

## 2. Deterministic game core

- [ ] 2.1 Replace fixed two-sector tuples with validated dynamic collections for sectorCount 2..6.
- [ ] 2.2 Generate symmetric five-wave schedules with one boss per sector in wave 5 and starting
      treasury `25 * sectorCount`.
- [ ] 2.3 Generalize fixed-step movement, tower attack, gate damage, repair, upgrade and
      ring-neighbor airstrike transitions.
- [ ] 2.4 Add parameterized unit tests for N=2..6, invalid sector/spawn config, builder invariants,
      symmetry, treasury, boss count, deterministic results and airstrike topology.
- [ ] 2.5 Verify core with `pnpm --filter @town-defenders/game-core test` and
      `pnpm --filter @town-defenders/game-core typecheck`.

## 3. Authoritative room lifecycle

- [ ] 3.1 Persist immutable playerCapacity from display creation and assign the lowest free stable
      sector at controller join.
- [ ] 3.2 Require exactly N connected ready players for one start and preserve/reserve sector
      identity across reconnect, expiry and active replacement.
- [ ] 3.3 Upgrade StateView with a display-only wrapper so controller decoded state omits enemies
      and lastAirstrikeEffect while both projections publish dynamic public sectors and player
      targets.
- [ ] 3.4 Bind action journal entries to actor and canonical fingerprint, preserve silent accepted
      replay / error rejection behavior and validate source/capacity/ring targets.
- [ ] 3.5 Add parameterized room tests for N=2..6 and network tests for N=2/4/6 covering start
      gating, room_full, reconnect/finished expiry/replacement, projection visibility, protocol
      mismatch, target outside room capacity, accepted/rejected replay after state changes or
      finished and cross-player/type/target actionId collisions.
- [ ] 3.6 Verify server with `pnpm --filter @town-defenders/server test` and
      `pnpm --filter @town-defenders/server typecheck`.

## 4. Display and layout catalog

- [ ] 4.1 Add pre-create capacity selector with default 2 and render dynamic lobby slots/roster.
- [ ] 4.2 Implement and validate normalized code-native layout manifests for capacities 2..6 with
      road endpoints equal to gate anchors.
- [ ] 4.3 Render N roads, gates, towers, labels, enemies and effects from authoritative capacity,
      keeping visual path length independent from simulation pathLength.
- [ ] 4.4 Add layout/unit tests for catalog completeness, unique sector IDs, safe anchors and cubic
      endpoint alignment.
- [ ] 4.5 Add a capacity-keyed environment asset catalog test: capacity 2 may use the existing
      two-road WebP while capacities 3..6 must select code-native fallback.
- [ ] 4.6 Verify display with `pnpm --filter @town-defenders/display test`,
      `pnpm --filter @town-defenders/display typecheck` and a production build.

## 5. Browser controller

- [ ] 5.1 Render dynamic roster/sectors and server-provided own, left and right airstrike targets
      without enemy identity data.
- [ ] 5.2 Preserve reconnect and command outcome UX under protocol v4.
- [ ] 5.3 Verify controller with `pnpm --filter @town-defenders/controller test`,
      `pnpm --filter @town-defenders/controller typecheck` and a production build.

## 6. Integrated verification and handoff

- [ ] 6.1 Update smoke and Playwright flows to cover create/join/ready for N=2, N=4 and N=6 and
      visually assert matching road/slot counts.
- [ ] 6.2 Run `pnpm check`, workspace tests/builds and the documented local smoke/E2E commands.
- [ ] 6.3 Document the follow-up art change for five hand-painted capacity 2..6 scenes without
      adding those assets to this implementation.
- [ ] 6.4 Perform realtime-contract and OpenSpec implementation reviews and resolve all blocking
      findings.
- [ ] 6.5 Reconcile this checklist, run strict OpenSpec validation and confirm the active change is
      ready to archive; archive, commit and local restart happen only after every checkbox is
      complete.
