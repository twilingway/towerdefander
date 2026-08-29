import { useEffect, useLayoutEffect, useRef } from "react";
import type { CrewRole, EncounterPhase, PublicShieldView } from "@spaceship-defender/protocol";

import {
  getFireReleaseDelay,
  getKeyboardVector,
  getNextShieldDesiredActive,
  LatestInputScheduler,
  type ControlVector
} from "../../controlInput.js";
import { AIM_RELEASE_DELAY_MS, NEUTRAL_CONTROL, type ControlState } from "../../model/control.js";

interface RoleControlsOptions {
  readonly role: CrewRole;
  readonly shield: PublicShieldView | undefined;
  readonly encounterPhase: EncounterPhase | undefined;
  readonly connectionDisabled: boolean;
  readonly generation: string;
  /**
   * Whether this instance owns the keyboard. The solo panel runs two instances
   * at once, and only one of them may answer WASD and Space.
   */
  readonly keyboard?: boolean;
  readonly onSend: (sequence: number, control: ControlState) => void;
}

export interface RoleControls {
  readonly controlsEnabled: boolean;
  readonly updateAim: (vector: ControlVector) => void;
  /** Tank helm: ask for a spin and a push along the nose, not for a bearing. */
  readonly updateHelm: (intent: { readonly turn: number; readonly thrust: number }) => void;
  readonly releaseAim: () => void;
  readonly cancelAim: () => void;
  readonly beginFire: () => void;
  readonly endFire: () => void;
  readonly cancelFire: () => void;
  readonly toggleShield: () => void;
}

/**
 * Every control the role panels drive: the input scheduler, the release timers
 * and the keyboard fallback. Kept out of the panels so the markup stays free of
 * refs and effects.
 */
export function useRoleControls({
  role,
  shield,
  encounterPhase,
  connectionDisabled,
  generation,
  keyboard = true,
  onSend
}: RoleControlsOptions): RoleControls {
  const controlReference = useRef<ControlState>(NEUTRAL_CONTROL);
  const firePressedAtReference = useRef<number | undefined>(undefined);
  const fireReleaseTimerReference = useRef<number | undefined>(undefined);
  const aimReleaseTimerReference = useRef<number | undefined>(undefined);
  const shieldSnapshotReference = useRef(shield);
  const shieldDesiredActiveReference = useRef(shield?.active ?? false);
  const previousShieldActiveReference = useRef(shield?.active ?? false);
  shieldSnapshotReference.current = shield;
  const sendReference = useRef(onSend);
  sendReference.current = onSend;
  const schedulerReference = useRef<LatestInputScheduler<ControlState> | undefined>(undefined);
  const schedulerGenerationReference = useRef(generation);
  schedulerReference.current ??= new LatestInputScheduler(
    NEUTRAL_CONTROL,
    ({ sequence, value }) => {
      sendReference.current(sequence, value);
    }
  );

  function update(patch: Partial<ControlState>): void {
    const next = { ...controlReference.current, ...patch };
    controlReference.current = next;
    schedulerReference.current?.update(next, performance.now());
  }

  function clearFireReleaseTimer(): void {
    if (fireReleaseTimerReference.current !== undefined) {
      window.clearTimeout(fireReleaseTimerReference.current);
      fireReleaseTimerReference.current = undefined;
    }
  }

  function clearAimReleaseTimer(): void {
    if (aimReleaseTimerReference.current !== undefined) {
      window.clearTimeout(aimReleaseTimerReference.current);
      aimReleaseTimerReference.current = undefined;
    }
  }

  function updateAim(vector: ControlVector): void {
    clearAimReleaseTimer();
    // Naming a bearing drops any spin intent, so a blur or a stick grab cannot
    // leave the hull turning on the last rate it was given.
    update({ vector, turn: null, thrust: null });
  }

  function updateHelm(intent: { readonly turn: number; readonly thrust: number }): void {
    clearAimReleaseTimer();
    update({ vector: NEUTRAL_CONTROL.vector, turn: intent.turn, thrust: intent.thrust });
  }

  function releaseAim(): void {
    clearAimReleaseTimer();
    if (role === "pilot") {
      update({ vector: NEUTRAL_CONTROL.vector });
      return;
    }
    aimReleaseTimerReference.current = window.setTimeout(() => {
      aimReleaseTimerReference.current = undefined;
      update({ vector: NEUTRAL_CONTROL.vector });
    }, AIM_RELEASE_DELAY_MS);
  }

  function cancelAim(): void {
    clearAimReleaseTimer();
    update({ vector: NEUTRAL_CONTROL.vector });
  }

  function setFireDesired(desired: boolean): void {
    if (role === "pilot") {
      update({ mgFiring: desired });
    } else {
      update({ firing: desired });
    }
  }

  function beginFire(): void {
    clearFireReleaseTimer();
    firePressedAtReference.current = performance.now();
    setFireDesired(true);
  }

  function endFire(): void {
    const pressedAt = firePressedAtReference.current;
    firePressedAtReference.current = undefined;
    const remainingMs = getFireReleaseDelay(pressedAt, performance.now());
    clearFireReleaseTimer();
    if (remainingMs === 0) {
      setFireDesired(false);
      return;
    }
    fireReleaseTimerReference.current = window.setTimeout(() => {
      fireReleaseTimerReference.current = undefined;
      setFireDesired(false);
    }, remainingMs);
  }

  function cancelFire(): void {
    firePressedAtReference.current = undefined;
    clearFireReleaseTimer();
    setFireDesired(false);
  }

  function toggleShield(): void {
    if (role !== "shield") return;
    const next = getNextShieldDesiredActive(
      shieldDesiredActiveReference.current,
      shieldSnapshotReference.current?.energy ?? 0
    );
    if (next === shieldDesiredActiveReference.current) return;
    shieldDesiredActiveReference.current = next;
    update({ active: next });
  }

  useEffect(() => {
    const keys = new Set<string>();
    const scheduler = schedulerReference.current;
    const timer = window.setInterval(() => scheduler?.flush(performance.now()), 25);
    const listensToKeys = keyboard;
    function applyKeys(): void {
      const vector = getKeyboardVector(keys);
      update({ vector });
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (!listensToKeys) return;
      if (
        [
          "KeyW",
          "KeyA",
          "KeyS",
          "KeyD",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "Space"
        ].includes(event.code)
      ) {
        event.preventDefault();
        if (event.code === "Space" && role === "shield") {
          if (!event.repeat) toggleShield();
          return;
        }
        if (
          event.code === "Space" &&
          (role === "gunner" || role === "pilot") &&
          !keys.has("Space")
        ) {
          beginFire();
        }
        keys.add(event.code);
        applyKeys();
      }
    }
    function onKeyUp(event: KeyboardEvent): void {
      if (!listensToKeys) return;
      if (event.code === "Space" && role === "shield") return;
      keys.delete(event.code);
      if (event.code === "Space" && (role === "gunner" || role === "pilot")) endFire();
      applyKeys();
    }
    function neutralize(): void {
      keys.clear();
      clearAimReleaseTimer();
      cancelFire();
      update({
        vector: NEUTRAL_CONTROL.vector,
        active: role === "shield" ? controlReference.current.active : false
      });
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", neutralize);
    document.addEventListener("visibilitychange", neutralize);
    return () => {
      controlReference.current = NEUTRAL_CONTROL;
      clearAimReleaseTimer();
      clearFireReleaseTimer();
      scheduler?.update(NEUTRAL_CONTROL, performance.now());
      scheduler?.flush(performance.now() + 50);
      window.clearInterval(timer);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", neutralize);
      document.removeEventListener("visibilitychange", neutralize);
    };
  }, [role, keyboard]);

  const controlsEnabled = !connectionDisabled && encounterPhase === "combat";
  useLayoutEffect(() => {
    const scheduler = schedulerReference.current;
    controlReference.current = NEUTRAL_CONTROL;
    shieldDesiredActiveReference.current = false;
    clearAimReleaseTimer();
    clearFireReleaseTimer();
    const now = performance.now();
    if (schedulerGenerationReference.current !== generation) {
      schedulerGenerationReference.current = generation;
      scheduler?.resetGeneration(NEUTRAL_CONTROL, now, controlsEnabled);
    } else if (controlsEnabled) {
      scheduler?.resumeWith(NEUTRAL_CONTROL, now);
    } else {
      scheduler?.setEnabled(false);
    }
  }, [controlsEnabled, generation]);

  useEffect(() => {
    const previousActive = previousShieldActiveReference.current;
    const active = shield?.active ?? false;
    previousShieldActiveReference.current = active;
    if (role === "shield" && previousActive && !active && shield?.energy === 0) {
      shieldDesiredActiveReference.current = false;
      update({ active: false });
    }
  }, [role, shield?.active, shield?.energy]);

  return {
    controlsEnabled,
    updateAim,
    updateHelm,
    releaseAim,
    cancelAim,
    beginFire,
    endFire,
    cancelFire,
    toggleShield
  };
}
