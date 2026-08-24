import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { normalizeControlVector, PointerCycle, type ControlVector } from "./controlInput.js";

interface VirtualStickProps {
  readonly label: string;
  readonly onChange: (vector: ControlVector) => void;
  readonly onRelease?: () => void;
  readonly onCancel?: () => void;
  readonly enabled?: boolean;
  readonly resetKey?: string;
}

const NEUTRAL: ControlVector = { x: 0, y: 0 };

export function VirtualStick({
  label,
  onChange,
  onRelease,
  onCancel,
  enabled = true,
  resetKey = ""
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
  const [vector, setVector] = useState<ControlVector>(NEUTRAL);

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
    setVector(next);
    onChangeReference.current(next);
  }

  function release(event?: ReactPointerEvent<HTMLDivElement>, cancelled = false): void {
    const released =
      event === undefined
        ? pointerCycle.cancel()
        : cancelled
          ? pointerCycle.cancel(event.pointerId)
          : pointerCycle.complete(event.pointerId);
    if (!released) return;
    setVector(NEUTRAL);
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
          transform: `translate(calc(-50% + ${String(vector.x * 54)}px), calc(-50% + ${String(vector.y * 54)}px))`
        }}
      />
    </div>
  );
}
