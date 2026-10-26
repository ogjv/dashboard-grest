import { useMemo, useState } from "react";
import type { AuditLogEntry } from "../types";
import { FilterSelect } from "./filterSelect";

type OperationalHistoryPanelProps = {
  entries?: AuditLogEntry[];
};

const moduleLabel = {
  dashboard: "Dashboard",
  dre: "DRE",
  "goods-entry": "Entrada de mercadorias"
} satisfies Record<AuditLogEntry["module"], string>;

const actionLabel = {
  update: "Atualização",
  import: "Importação",
  remove: "Exclusão"
} satisfies Record<AuditLogEntry["action"], string>;

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

function EmptyStateIcon() {
  return (
    <span className="empty-state-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="7" />
        <path d="M11 8c-1.66 0-3 1.34-3 3" />
        <path d="M20 20l-3-3" />
      </svg>
    </span>
  );
}

export function OperationalHistoryPanel({ entries = [] }: OperationalHistoryPanelProps) {
  const [selectedDay, setSelectedDay] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [selectedYear, setSelectedYear] = useState("all");

  const sortedEntries = useMemo(
    () => [...entries].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [entries]
  );
  const years = useMemo(
    () => [...new Set(sortedEntries.map((entry) => new Date(entry.createdAt).getFullYear()))].sort((left, right) => right - left),
    [sortedEntries]
  );
  const months = useMemo(
    () =>
      [...new Set(
        sortedEntries
          .filter((entry) => selectedYear === "all" || String(new Date(entry.createdAt).getFullYear()) === selectedYear)
          .map((entry) => String(new Date(entry.createdAt).getMonth() + 1).padStart(2, "0"))
      )].sort(),
    [selectedYear, sortedEntries]
  );
  const days = useMemo(
    () =>
      [...new Set(
        sortedEntries
          .filter((entry) => selectedYear === "all" || String(new Date(entry.createdAt).getFullYear()) === selectedYear)
          .filter((entry) => selectedMonth === "all" || String(new Date(entry.createdAt).getMonth() + 1).padStart(2, "0") === selectedMonth)
          .map((entry) => String(new Date(entry.createdAt).getDate()).padStart(2, "0"))
      )].sort((left, right) => Number(left) - Number(right)),
    [selectedMonth, selectedYear, sortedEntries]
  );
  const filteredEntries = sortedEntries.filter((entry) => {
    const date = new Date(entry.createdAt);
    if (selectedYear !== "all" && String(date.getFullYear()) !== selectedYear) {
      return false;
    }
    if (selectedMonth !== "all" && String(date.getMonth() + 1).padStart(2, "0") !== selectedMonth) {
      return false;
    }
    if (selectedDay !== "all" && String(date.getDate()).padStart(2, "0") !== selectedDay) {
      return false;
    }
    return true;
  });
  const yearOptions = [{ value: "all", label: "Todos" }, ...years.map((year) => ({ value: String(year), label: String(year) }))];
  const monthOptions = [{ value: "all", label: "Todos" }, ...months.map((month) => ({ value: month, label: month }))];
  const dayOptions = [{ value: "all", label: "Todos" }, ...days.map((day) => ({ value: day, label: day }))];

  return (
    <section className="card operational-history-panel">
      <div className="section-head">
        <div>
          <h3>Histórico operacional</h3>
          <p>Importações, ajustes e exclusões registrados nas abas de Dashboard, DRE e Entrada de mercadorias.</p>
        </div>
        <span className="cmv-pill pending">{filteredEntries.length} evento(s)</span>
      </div>

      <div className="operational-history-filters">
        <FilterSelect
          label="Ano"
          value={selectedYear}
          options={yearOptions}
          onChange={(nextValue) => {
            setSelectedYear(nextValue);
            setSelectedMonth("all");
            setSelectedDay("all");
          }}
        />
        <FilterSelect
          label="Mês"
          value={selectedMonth}
          options={monthOptions}
          onChange={(nextValue) => {
            setSelectedMonth(nextValue);
            setSelectedDay("all");
          }}
        />
        <FilterSelect label="Dia" value={selectedDay} options={dayOptions} onChange={setSelectedDay} />
      </div>

      {filteredEntries.length === 0 ? (
        <section className="empty-state-card operational-history-empty">
          <div className="empty-state-inner">
            <EmptyStateIcon />
            <h3>Nenhum evento encontrado</h3>
            <p>Altere os filtros ou realize uma importação/exclusão para registrar novas movimentações operacionais.</p>
          </div>
        </section>
      ) : (
        <div className="operational-history-list">
          {filteredEntries.map((entry) => (
            <article key={entry.id} className={`operational-history-row ${entry.action}`}>
              <div className="operational-history-main">
                <span className="eyebrow">{moduleLabel[entry.module]} · {actionLabel[entry.action]}</span>
                <strong>{entry.periodLabel ?? entry.title}</strong>
                <p>{entry.detail ?? entry.title}</p>
                {entry.fileNames?.length ? <small>{entry.fileNames.join(" · ")}</small> : null}
              </div>
              <div className="operational-history-meta">
                <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time>
                <span>{entry.actorEmail ?? "Conta não registrada"}</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
