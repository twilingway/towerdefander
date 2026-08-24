import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { PointerCycle } from "./controlInput.js";

interface ActionZoneProps {
  readonly label: string;
  readonly testId: string;
  readonly className: string;
  readonly disabled: boolean;
  readonly mode: "hold" | "toggle";
  readonly active?: boolean;
  readonly resetKey: string;
  readonly onBegin?: () => void;
  readonly onEnd?: () => void;
  readonly onCancel?: () => void;
  readonly onToggle?: () => void;
}

export function ActionZone({
  label,
  testId,
  className,
  disabled,
  mode,
  active,
  resetKey,
  onBegin,
  onEnd,
  onCancel,
  onToggle
}: ActionZoneProps) {
  const hostReference = useRef<HTMLButtonElement>(null);
  const pointerCycleReference = useRef<PointerCycle>(undefined);
  const pointerCycle = (pointerCycleReference.current ??= new PointerCycle());
  const callbackReference = useRef({ onBegin, onEnd, onCancel, onToggle });
  callbackReference.current = { onBegin, onEnd, onCancel, onToggle };
  const [pressed, setPressed] = useState(false);

  function cancelPointer(pointerId?: number): void {
    const ownedPointerId = pointerCycle.current();
    if (!pointerCycle.cancel(pointerId)) return;
    const host = hostReference.current;
    if (ownedPointerId !== undefined && host?.hasPointerCapture(ownedPointerId) === true) {
      host.releasePointerCapture(ownedPointerId);
    }
    setPressed(false);
    if (mode === "hold")
      (callbackReference.current.onCancel ?? callbackReference.current.onEnd)?.();
  }

  function completePointer(event: ReactPointerEvent<HTMLButtonElement>): void {
    if (!pointerCycle.complete(event.pointerId)) return;
    setPressed(false);
    if (mode === "hold") callbackReference.current.onEnd?.();
    else callbackReference.current.onToggle?.();
  }

  useEffect(() => {
    function onBlur(): void {
      cancelPointer();
    }
    function onVisibilityChange(): void {
      if (document.visibilityState === "hidden") cancelPointer();
    }

    if (disabled) cancelPointer();
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      cancelPointer();
    };
  }, [disabled, mode, resetKey]);

  return (
    <button
      ref={hostReference}
      type="button"
      className={`hold-action action-zone ${className}${pressed ? " is-pressed" : ""}`}
      data-testid={testId}
      data-pressed={pressed}
      aria-pressed={mode === "toggle" ? active : pressed}
      disabled={disabled}
      onPointerDown={(event) => {
        if (disabled || !pointerCycle.claim(event.pointerId, event.button)) {
          return;
        }
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        setPressed(true);
        if (mode === "hold") callbackReference.current.onBegin?.();
      }}
      onPointerUp={completePointer}
      onPointerCancel={(event) => {
        cancelPointer(event.pointerId);
      }}
      onLostPointerCapture={(event) => {
        cancelPointer(event.pointerId);
      }}
    >
      {label}
    </button>
  );
}
