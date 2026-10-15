import { useEffect, useId, useRef, useState } from "react";
import type { FocusEvent } from "react";

export type FilterSelectOption = {
  value: string;
  label: string;
};

type FilterSelectProps = {
  label: string;
  value: string;
  options: FilterSelectOption[];
  onChange: (value: string) => void;
};

export function FilterSelect({ label, value, options, onChange }: FilterSelectProps) {
  const [open, setOpen] = useState(false);
  const controlRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const keyboardOpening = useRef(false);
  const selectedOption = options.find((option) => option.value === value) ?? options[0];
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (!controlRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  useEffect(() => {
    if (open && keyboardOpening.current) {
      controlRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
      keyboardOpening.current = false;
    }
  }, [open]);

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setOpen(false);
    }
  };

  return (
    <div ref={controlRef} className={`filter-select-control ${open ? "open" : ""}`} onBlur={handleBlur} onKeyDown={(event) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      if (!open) {
        keyboardOpening.current = true;
        setOpen(true);
        return;
      }
      const buttons = [...(controlRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])];
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
        : event.key === "ArrowDown" ? (current + 1) % buttons.length : current <= 0 ? buttons.length - 1 : current - 1;
      buttons[next]?.focus();
    }}>
      <span>{label}</span>
      <button
        type="button"
        className="filter-select-button"
        ref={buttonRef}
        aria-label={`${label}: ${selectedOption?.label ?? "Selecionar"}`}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <strong>{selectedOption?.label ?? "Selecionar"}</strong>
        <svg viewBox="0 0 24 24" className="filter-select-chevron" aria-hidden="true">
          <path d="m7 10 5 5 5-5" />
        </svg>
      </button>

      {open ? (
        <div className="filter-select-menu" role="listbox" id={menuId} aria-label={label}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={`filter-select-option ${option.value === value ? "active" : ""}`}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
                buttonRef.current?.focus();
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
