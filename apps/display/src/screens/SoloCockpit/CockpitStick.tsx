import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import {
  PointerCycle,
  neutralStickReading,
  readStick,
  type ControlVector,
  type StickReading
} from "@spaceship-defender/client-shared";

interface CockpitStickProps {
  readonly label: string;
  readonly onChange: (vector: ControlVector, strength: number) => void;
  readonly onRelease: () => void;
  readonly enabled: boolean;
  /** Share of the ring radius the thumb travels before anything is reported. */
  readonly deadzoneShare: number;
  /** Extra class on the grab zone, so the two sticks can sit on opposite edges. */
  readonly side: "left" | "right";
}

/**
 * The STEEL VOID stick: a grab zone much larger than the ring it moves.
 *
 * The controller's own `VirtualStick` reads the pointer against the element it
 * is drawn in, which makes the drawn ring the whole target. Over a battle
 * canvas that is the wrong shape — a thumb that lands an inch off finds
 * nothing, and looking down to aim a thumb is exactly what a stick is for. So
 * the zone takes the touch and the ring supplies the anchor, which is what the
 * lab does (`mobileControls.js:_resolveDriveOrigin`, index.pretty.js:167047).
 */
export function CockpitStick({
  label,
  onChange,
  onRelease,
  enabled,
  deadzoneShare,
  side
}: CockpitStickProps) {
  const zoneReference = useRef<HTMLDivElement>(null);
  const ringReference = useRef<HTMLDivElement>(null);
  const pointerCycleReference = useRef<PointerCycle>(undefined);
  const pointerCycle = (pointerCycleReference.current ??= new PointerCycle());
  const onChangeReference = useRef(onChange);
  const onReleaseReference = useRef(onRelease);
  onChangeReference.current = onChange;
  onReleaseReference.current = onRelease;
  const [reading, setReading] = useState<StickReading>(neutralStickReading);

  function applyPointer(event: ReactPointerEvent<HTMLDivElement>): void {
    const ring = ringReference.current;
    if (ring === null) return;
    const bounds = ring.getBoundingClientRect();
    const next = readStick(
      { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 },
      { x: event.clientX, y: event.clientY },
      Math.max(1, Math.min(bounds.width, bounds.height) / 2),
      deadzoneShare
    );
    // The knob follows the thumb even inside the dead zone, so the stick reads
    // as live while it is being nudged rather than looking stuck.
    setReading(next);
    onChangeReference.current(next.vector, next.strength);
  }

  function release(pointerId?: number, cancelled = false): void {
    const released =
      pointerId === undefined
        ? pointerCycle.cancel()
        : cancelled
          ? pointerCycle.cancel(pointerId)
          : pointerCycle.complete(pointerId);
    if (!released) return;
    setReading(neutralStickReading());
    onReleaseReference.current();
  }

  useEffect(() => {
    function cancelPointer(): void {
      const pointerId = pointerCycle.current();
      if (pointerId === undefined) return;
      const zone = zoneReference.current;
      if (zone?.hasPointerCapture(pointerId) === true) zone.releasePointerCapture(pointerId);
      release(pointerId, true);
    }

    function onVisibilityChange(): void {
      if (document.visibilityState === "hidden") cancelPointer();
    }

    if (!enabled) cancelPointer();
    window.addEventListener("blur", cancelPointer);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("blur", cancelPointer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      cancelPointer();
    };
  }, [enabled]);

  return (
    <div
      ref={zoneReference}
      className={`cockpit-stick cockpit-stick--${side}`}
      role="application"
      aria-label={label}
      aria-disabled={!enabled}
      data-testid={`cockpit-stick-${side}`}
      data-strength={reading.strength.toFixed(2)}
      onPointerDown={(event) => {
        if (!enabled || !pointerCycle.claim(event.pointerId, event.button)) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        applyPointer(event);
      }}
      onPointerMove={(event) => {
        if (pointerCycle.owns(event.pointerId)) applyPointer(event);
      }}
      onPointerUp={(event) => {
        release(event.pointerId);
      }}
      onPointerCancel={(event) => {
        release(event.pointerId, true);
      }}
      onLostPointerCapture={(event) => {
        release(event.pointerId, true);
      }}
    >
      <div ref={ringReference} className="cockpit-stick__ring">
        <span
          className="cockpit-stick__knob"
          style={{
            // Pixels, straight from the reading: the geometry already clamped
            // the knob to the ring, so nothing here has to know the ring size.
            transform: `translate(calc(-50% + ${String(reading.knob.x)}px), calc(-50% + ${String(reading.knob.y)}px))`
          }}
        />
      </div>
    </div>
  );
}
