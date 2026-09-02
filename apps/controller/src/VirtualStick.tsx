import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import {
  commitAim,
  normalizeControlVector,
  PointerCycle,
  throttleAim,
  type ControlVector
} from "./controlInput.js";

interface VirtualStickProps {
  readonly label: string;
  readonly onChange: (vector: ControlVector) => void;
  readonly onRelease?: () => void;
  readonly onCancel?: () => void;
  readonly enabled?: boolean;
  readonly resetKey?: string;
  /**
   * How far the stick must be pushed before it reports a bearing at all. Given
   * one, the knob still follows the thumb but the seat is only told about a
   * deliberate push, and a pointer that comes up without ever reaching it is a
   * tap rather than a turn.
   */
  readonly commitShare?: number;
  readonly onTap?: () => void;
  /**
   * How far the stick must be pushed to ask for everything the hull has. The
   * length of the push is the throttle, so without this the top speed lives
   * only at the rim.
   */
  readonly fullThrottleShare?: number;
}

const NEUTRAL: ControlVector = { x: 0, y: 0 };

export function VirtualStick({
  label,
  onChange,
  onRelease,
  onCancel,
  enabled = true,
  resetKey = "",
  commitShare,
  onTap,
  fullThrottleShare
}: VirtualStickProps) {
  const hostReference = useRef<HTMLDivElement>(null);
  const pointerCycleReference = useRef<PointerCycle>(undefined);
  const pointerCycle = (pointerCycleReference.current ??= new PointerCycle());
  const onChangeReference = useRef(onChange);
  const onReleaseReference = useRef(onRelease);
  const onCancelReference = useRef(onCancel);
  onChangeReference.current = onChange;
  onReleaseReference.current = onRelease;
  onCancelReference.current = onCancel;
  const onTapReference = useRef(onTap);
  onTapReference.current = onTap;
  const [vector, setVector] = useState<ControlVector>(NEUTRAL);
  const [committed, setCommitted] = useState(false);
  const committedReference = useRef(false);

  function applyPointer(event: ReactPointerEvent<HTMLDivElement>): void {
    const host = hostReference.current;
    if (host === null) {
      return;
    }
    const bounds = host.getBoundingClientRect();
    const radius = Math.max(1, Math.min(bounds.width, bounds.height) / 2);
    const next = normalizeControlVector({
      x: (event.clientX - (bounds.left + bounds.width / 2)) / radius,
      y: (event.clientY - (bounds.top + bounds.height / 2)) / radius
    });
    // The knob follows the thumb whatever the seat is told, so the stick still
    // reads as live while it is being nudged.
    setVector(next);
    if (commitShare === undefined) {
      onChangeReference.current(
        fullThrottleShare === undefined ? next : throttleAim(next, fullThrottleShare)
      );
      return;
    }
    const commanded = commitAim(next, commitShare);
    if (commanded !== null && !committedReference.current) {
      committedReference.current = true;
      setCommitted(true);
    }
    onChangeReference.current(commanded ?? NEUTRAL);
  }

  function release(event?: ReactPointerEvent<HTMLDivElement>, cancelled = false): void {
    const released =
      event === undefined
        ? pointerCycle.cancel()
        : cancelled
          ? pointerCycle.cancel(event.pointerId)
          : pointerCycle.complete(event.pointerId);
    if (!released) return;
    // A pointer that came and went without ever asking for a bearing is a tap.
    // Cancelled ones are not: a stick torn away by a blur asked for nothing
    // either, and firing on that would be a shot nobody meant.
    const tapped = !cancelled && !committedReference.current;
    committedReference.current = false;
    setCommitted(false);
    setVector(NEUTRAL);
    if (tapped) onTapReference.current?.();
    if (cancelled) {
      (onCancelReference.current ?? onReleaseReference.current)?.();
    } else if (onReleaseReference.current !== undefined) {
      onReleaseReference.current();
    } else {
      onChangeReference.current(NEUTRAL);
    }
  }

  useEffect(() => {
    function cancelPointer(): void {
      const pointerId = pointerCycle.current();
      if (pointerId === undefined) return;
      const host = hostReference.current;
      if (host?.hasPointerCapture(pointerId) === true) host.releasePointerCapture(pointerId);
      if (!pointerCycle.cancel(pointerId)) return;
      committedReference.current = false;
      setCommitted(false);
      setVector(NEUTRAL);
      (onCancelReference.current ?? onReleaseReference.current)?.();
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
  }, [enabled, resetKey]);

  return (
    <div
      ref={hostReference}
      className="virtual-stick"
      role="application"
      aria-label={label}
      data-testid="virtual-stick"
      aria-disabled={!enabled}
      data-committed={commitShare === undefined ? undefined : String(committed)}
      onPointerDown={(event) => {
        if (!enabled || !pointerCycle.claim(event.pointerId, event.button)) {
          return;
        }
        event.currentTarget.setPointerCapture(event.pointerId);
        applyPointer(event);
      }}
      onPointerMove={(event) => {
        if (pointerCycle.owns(event.pointerId)) {
          applyPointer(event);
        }
      }}
      onPointerUp={(event) => {
        release(event);
      }}
      onPointerCancel={(event) => {
        release(event, true);
      }}
      onLostPointerCapture={(event) => {
        release(event, true);
      }}
    >
      <span
        className="virtual-stick__knob"
        style={{
          // --stick-travel scales with the stick, so the knob stays inside the
          // ring on a small phone and on a tablet alike.
          transform: `translate(calc(-50% + var(--stick-travel, 3.375rem) * ${String(vector.x)}), calc(-50% + var(--stick-travel, 3.375rem) * ${String(vector.y)}))`
        }}
      />
    </div>
  );
}
