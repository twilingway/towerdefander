import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { PointerCycle } from "@spaceship-defender/client-shared";

interface CockpitTriggerProps {
  readonly label: string;
  readonly onHoldChange: (held: boolean) => void;
  readonly enabled: boolean;
  /** Filled share of the heat bar drawn behind the label, on `[0, 1]`. */
  readonly heat: number;
  readonly overheated: boolean;
  readonly testId: string;
}

/**
 * A hold trigger. Its own pointer cycle, so a thumb here and a thumb on a stick
 * are two independent touches — which is the whole point of a cockpit that
 * drives and shoots at once.
 */
export function CockpitTrigger({
  label,
  onHoldChange,
  enabled,
  heat,
  overheated,
  testId
}: CockpitTriggerProps) {
  const hostReference = useRef<HTMLButtonElement>(null);
  const pointerCycleReference = useRef<PointerCycle>(undefined);
  const pointerCycle = (pointerCycleReference.current ??= new PointerCycle());
  const onHoldChangeReference = useRef(onHoldChange);
  onHoldChangeReference.current = onHoldChange;
  const [held, setHeld] = useState(false);

  function stop(pointerId?: number): void {
    const released =
      pointerId === undefined ? pointerCycle.cancel() : pointerCycle.cancel(pointerId);
    if (!released) return;
    setHeld(false);
    onHoldChangeReference.current(false);
  }

  useEffect(() => {
    function cancelPointer(): void {
      const pointerId = pointerCycle.current();
      if (pointerId === undefined) return;
      const host = hostReference.current;
      if (host?.hasPointerCapture(pointerId) === true) host.releasePointerCapture(pointerId);
      stop(pointerId);
    }

    function onVisibilityChange(): void {
      if (document.visibilityState === "hidden") cancelPointer();
    }

    // A trigger nobody is holding must not keep firing because a phone locked.
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
    <button
      ref={hostReference}
      type="button"
      className="cockpit-trigger"
      aria-label={label}
      aria-pressed={held}
      aria-disabled={!enabled}
      data-testid={testId}
      data-overheated={String(overheated)}
      onPointerDown={(event: ReactPointerEvent<HTMLButtonElement>) => {
        if (!enabled || !pointerCycle.claim(event.pointerId, event.button)) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        setHeld(true);
        onHoldChangeReference.current(true);
      }}
      onPointerUp={(event) => {
        stop(event.pointerId);
      }}
      onPointerCancel={(event) => {
        stop(event.pointerId);
      }}
      onLostPointerCapture={(event) => {
        stop(event.pointerId);
      }}
    >
      <span
        className="cockpit-trigger__heat"
        style={{ transform: `scaleY(${String(Math.max(0, Math.min(1, heat)))})` }}
      />
      <span className="cockpit-trigger__label">{label}</span>
    </button>
  );
}
