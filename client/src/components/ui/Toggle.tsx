interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  /** Optional swatch colour shown left of the label. */
  swatch?: string;
}

/**
 * A compact, accessible on/off switch.
 *
 * The whole row is a single `role="switch"` button — deliberately NOT a
 * `<button>` nested in a `<label>`, which double-fires the click (the label
 * re-dispatches to its control) and makes the toggle appear to do nothing.
 */
export function Toggle({ checked, onChange, label, swatch }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="flex w-full cursor-pointer select-none items-center justify-between gap-2 py-1 text-left"
    >
      <span className="flex min-w-0 items-center gap-2">
        {swatch && (
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-[2px] ring-1 ring-black/30"
            style={{ backgroundColor: swatch }}
            aria-hidden
          />
        )}
        <span className="truncate font-sans text-xs text-ink">{label}</span>
      </span>
      <span
        className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-signal' : 'bg-hairline'
        }`}
        aria-hidden
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-chrome transition-transform ${
            checked ? 'translate-x-3.5' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
}
