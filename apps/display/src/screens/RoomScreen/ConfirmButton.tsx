import { useEffect, useState } from "react";

/** How long an armed button waits before it forgets it was pressed. */
const ARMED_MS = 4_000;

/**
 * A destructive button that asks, without leaving the game to ask.
 *
 * The browser's own `confirm` is a system dialog: it pins the page, it is
 * styled by the operating system rather than by the game, and on a phone it
 * drops out of full screen to show itself. Two presses do the same job in the
 * same place - the first arms the button and says what it is about to do, the
 * second does it - and the arming forgets itself after a few seconds, so a
 * stray tap cannot leave a live trap on the screen.
 */
export function ConfirmButton({
  className,
  testId,
  disabled,
  label,
  confirmLabel,
  onConfirm
}: {
  readonly className: string;
  readonly testId: string;
  readonly disabled: boolean;
  readonly label: string;
  /** What the button says once it is armed; the question, in one line. */
  readonly confirmLabel: string;
  readonly onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => {
      setArmed(false);
    }, ARMED_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [armed]);

  return (
    <button
      type="button"
      className={`${className}${armed ? " is-armed" : ""}`}
      data-testid={testId}
      data-armed={armed}
      disabled={disabled}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        onConfirm();
      }}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}
