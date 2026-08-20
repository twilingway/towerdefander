## 1. Specification and protocol v7

- [x] 1.1 Validate the first OpenSpec profile and archive-application compatibility.
- [x] 1.2 Revalidate revised public-latency/camera deltas and archive dry-run.
- [x] 1.3 Add protocol v7 strict probe/pong schemas, message names, display/player latency fields
      and v6 mismatch/schema tests.

## 2. Simulation and world

- [x] 2.1 Change default world to 4800×3200 and angular max/acceleration/braking defaults by exactly
      1.3.
- [x] 2.2 Verify initial center, 52-tick turret and 43-tick shield traverses deterministically.
- [x] 2.3 Synchronize server defaults and distribute decorative primitives across the expanded
      world.

## 3. Server-owned latency

- [x] 3.1 Implement one unique server probe per live connection after join/reconnect and no sooner
      than every 2 s, with 5 s expiry, monotonic RTT and bounded five-sample median.
- [x] 3.2 Publish/reset display/player latency across join, timeout, disconnect, reconnect,
      replacement and disposal.
- [x] 3.3 Validate pong protocol/schema/room/probe ownership and cover duplicate, late, unknown,
      cross-connection and v6 cases without gameplay mutation.

## 4. Client telemetry UI

- [x] 4.1 Replace local Room.ping monitors with strict probe responders in display/controller.
- [x] 4.2 Adapt v7 StateViews and render display/pilot/gunner/shield ping on lobby and active
      battlefield plus own ping on controller.
- [x] 4.3 Add adapter/server/E2E tests for numeric, unknown, disconnected and reconnect latency
      states.

## 5. Distant safe camera

- [x] 5.1 Keep active display fullscreen, HUD overlays and inactive shield directional style.
- [x] 5.2 Change responsive base view to 1600×900 and implement zoom-correct Phaser scroll
      conversion.
- [x] 5.3 Add zoom-derived camera overscan and verify full castle/turret/shield visibility with
      160px safe framing at all four world edges and supported aspect ratios.

## 6. Verification and handoff

- [x] 6.1 Update project documentation for protocol v7, public ping, distant camera and
      Tyrian-inspired follow-up.
- [x] 6.2 Run package checks, `pnpm check`, `pnpm spec:validate`, archive dry-run, network smoke and
      Playwright.
- [x] 6.3 Complete read-only implementation review and reconcile tasks/specs.
- [x] 6.4 Restart local server/display/controller and hand off a new room for manual playtest.
- [x] 6.5 After user confirmation, archive the OpenSpec change and commit/push separately.
