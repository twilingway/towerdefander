import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { normalizeControlVector, type ControlVector } from "./controlInput.js";

interface VirtualStickProps {
  readonly label: string;
  readonly onChange: (vector: ControlVector) => void;
  readonly onRelease?: () => void;
  readonly onCancel?: () => void;
}

const NEUTRAL: ControlVector = { x: 0, y: 0 };

export function VirtualStick({ label, onChange, onRelease, onCancel }: VirtualStickProps) {
  const hostReference = useRef<HTMLDivElement>(null);
  const pointerReference = useRef<number | undefined>(undefined);
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
    onChange(next);
  }

  function release(event?: ReactPointerEvent<HTMLDivElement>, cancelled = false): void {
    if (event !== undefined && pointerReference.current !== event.pointerId) {
      return;
    }
    pointerReference.current = undefined;
    setVector(NEUTRAL);
    if (cancelled) {
      (onCancel ?? onRelease)?.();
    } else if (onRelease !== undefined) {
      onRelease();
    } else {
      onChange(NEUTRAL);
    }
  }

  return (
    <div
      ref={hostReference}
      className="virtual-stick"
      role="application"
      aria-label={label}
      data-testid="virtual-stick"
      onPointerDown={(event) => {
        if (!event.isPrimary || event.button !== 0) return;
        pointerReference.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        applyPointer(event);
      }}
      onPointerMove={(event) => {
        if (pointerReference.current === event.pointerId) {
          applyPointer(event);
        }
      }}
      onPointerUp={(event) => {
        release(event);
      }}
      onPointerCancel={(event) => {
        release(event, true);
      }}
      onLostPointerCapture={() => {
        if (pointerReference.current !== undefined) {
          release(undefined, true);
        }
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
