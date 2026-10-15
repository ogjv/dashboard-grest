import { useEffect, useId, useRef, useState } from "react";
import { navigateDetailsMenu } from "../utils/menuKeyboard";

export type SelectablePeriod = { key: string; label: string; year?: number };

export function PeriodSelector({ periods, selectedKeys, multiple = false, onSelect, onRemove, totalKey }: {
  periods: SelectablePeriod[];
  selectedKeys: string[];
  multiple?: boolean;
  onSelect: (keys: string[]) => void;
  onRemove?: (key: string) => void;
  totalKey?: string;
}) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const menuId = useId();
  const years = [...new Set(periods.map((period) => period.year).filter((year): year is number => year !== undefined))].sort((left, right) => right - left);
  const selectedYear = periods.find((period) => selectedKeys.includes(period.key))?.year;
  const [browsedYear, setBrowsedYear] = useState<number | undefined>(selectedYear ?? years[0]);
  const activeYear = selectedYear ?? (years.includes(browsedYear ?? 0) ? browsedYear : years[0]);
  const visiblePeriods = periods.filter((period) => period.year === activeYear);
  const selected = periods.filter((period) => selectedKeys.includes(period.key));
  const isTotal = totalKey !== undefined && selectedKeys.includes(totalKey);
  const selectionLabel = isTotal ? "Todos os períodos" : selected.length > 1 ? `${selected.length} meses selecionados` : selected[0]?.label ?? "Selecionar mês";
  const selectionDescription = selected.length > 1 ? selected.map((period) => period.label).join(", ") : undefined;

  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) menuRef.current?.removeAttribute("open");
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);

  return (
    <div className="analysis-period-toolbar">
      <label className="analysis-year-field">
        <span>Ano</span>
        <select aria-label="Ano da análise" value={activeYear ?? ""} onChange={(event) => {
          const year = Number(event.target.value);
          setBrowsedYear(year);
          const latest = periods.filter((period) => period.year === year).slice(-1)[0];
          if (latest) onSelect([latest.key]);
        }}>
          {years.map((year) => <option key={year} value={year}>{year}</option>)}
          {years.length === 0 ? <option value="">Sem ano</option> : null}
        </select>
      </label>
      <details className="analysis-month-field" ref={menuRef} onKeyDown={navigateDetailsMenu}>
        <summary aria-controls={menuId}>
          <span><small>{multiple ? "Meses" : "Mês"}</small><strong>{selectionLabel}</strong>{selectionDescription ? <span className="selection-description">{selectionDescription}</span> : null}</span>
          <svg className="filter-select-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
        </summary>
        <div id={menuId} className="analysis-month-menu">
          {multiple && visiblePeriods.length > 1 ? <div className="selection-quick-actions">
            <button type="button" onClick={() => onSelect(visiblePeriods.map((period) => period.key))}>Todos de {activeYear ?? "este ano"}</button>
            <button type="button" disabled={selected.length <= 1} onClick={() => {
              const retained = selected.filter((period) => period.year === activeYear).slice(-1)[0] ?? visiblePeriods.slice(-1)[0];
              if (retained) onSelect([retained.key]);
            }}>Manter só o último mês</button>
          </div> : null}
          <div className="analysis-month-options">
            {totalKey ? <button type="button" className="analysis-month-option" aria-pressed={isTotal} onClick={() => {
              onSelect([totalKey]);
              menuRef.current?.removeAttribute("open");
            }}>Todos os períodos</button> : null}
            {visiblePeriods.map((period) => (
              <div className="analysis-month-row" key={period.key}>
                <button type="button" className="analysis-month-option" aria-pressed={selectedKeys.includes(period.key)} onClick={() => {
                  const currentKeys = selectedKeys.filter((key) => visiblePeriods.some((item) => item.key === key));
                  const nextKeys = currentKeys.includes(period.key) ? currentKeys.filter((key) => key !== period.key) : [...currentKeys, period.key].sort();
                  onSelect(multiple ? nextKeys.length ? nextKeys : [period.key] : [period.key]);
                  if (!multiple) menuRef.current?.removeAttribute("open");
                }}>
                  <span className="analysis-month-check" aria-hidden="true">{selectedKeys.includes(period.key) ? "✓" : ""}</span>
                  {period.label}
                </button>
                {onRemove ? <button type="button" className="analysis-period-remove" aria-label={`Excluir ${period.label}`} onClick={() => {
                  menuRef.current?.removeAttribute("open");
                  onRemove(period.key);
                }}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7" /></svg>
                </button> : null}
              </div>
            ))}
          </div>
        </div>
      </details>
    </div>
  );
}
