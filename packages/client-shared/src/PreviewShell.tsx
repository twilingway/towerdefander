import { useState } from "react";
import type { ReactNode } from "react";

import { PREVIEW_PHASES, previewPhaseLabel } from "./preview.js";
import type { PreviewPhase } from "./preview.js";

/**
 * The collapsible frame around the dev preview switches. Display and controller
 * put different switches inside it, so the shell owns only the chrome: the
 * toggle, the caption, and the collapsed modifier the stylesheets key on.
 */
export function PreviewShell({ children }: { readonly children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div
      className={`preview-controls${open ? "" : " preview-controls--collapsed"}`}
      data-testid="preview-controls"
    >
      <button
        type="button"
        className="preview-controls__toggle"
        aria-expanded={open}
        aria-label={open ? "Свернуть панель превью" : "Развернуть панель превью"}
        onClick={() => {
          setOpen((value) => !value);
        }}
      >
        {open ? "×" : "⚙"}
      </button>
      {open && (
        <>
          <span className="eyebrow">Превью верстки</span>
          {children}
        </>
      )}
    </div>
  );
}

/** Bare buttons: the caller decides whether they need a grouping wrapper. */
export function PreviewPhaseButtons({
  phase,
  onPhaseChange
}: {
  readonly phase: PreviewPhase;
  readonly onPhaseChange: (phase: PreviewPhase) => void;
}) {
  return (
    <>
      {PREVIEW_PHASES.map((candidate) => (
        <button
          key={candidate}
          type="button"
          aria-pressed={candidate === phase}
          onClick={() => {
            onPhaseChange(candidate);
          }}
        >
          {previewPhaseLabel(candidate)}
        </button>
      ))}
    </>
  );
}
