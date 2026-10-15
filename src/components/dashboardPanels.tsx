import { useEffect, useRef, useState } from "react";
import { navigateDetailsMenu } from "../utils/menuKeyboard";

type RestaurantTileMembership = {
  membershipId: string;
  restaurantId: string;
  restaurantName: string;
  photoUrl?: string;
};

type RestaurantNavigatorPanelProps = {
  eyebrow: string;
  title: string;
  description?: string;
  memberships: RestaurantTileMembership[];
  activeRestaurantId?: string;
  multiple?: boolean;
  selectedRestaurantIds?: string[];
  selectionLabel?: string;
  disabled?: boolean;
  onActivateRestaurant: (restaurantId: string) => void;
};

type DashboardGuideSignal = {
  title: string;
  text: string;
  tone: "good" | "mid" | "bad";
};

type DashboardGuideBar = {
  label: string;
  value: number;
  color: string;
};

type DashboardReadOnlyGuideProps = {
  eyebrow: string;
  title: string;
  text: string;
  revenueLabel: string;
  revenueValue: string;
  revenueTrend: string;
  salesChartTitle: string;
  salesChartHint: string;
  cmvTitle: string;
  cmvText: string;
  alertLabel: string;
  alertTitle: string;
  alertText: string;
  signals: DashboardGuideSignal[];
  bars: DashboardGuideBar[];
};

export function RestaurantNavigatorPanel({
  title,
  memberships,
  activeRestaurantId,
  multiple = false,
  selectedRestaurantIds = [],
  selectionLabel: customLabel,
  disabled = false,
  onActivateRestaurant
}: RestaurantNavigatorPanelProps) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const [query, setQuery] = useState("");
  const selectedRestaurants = memberships.filter((membership) => selectedRestaurantIds.includes(membership.restaurantId));
  const active = multiple ? selectedRestaurants[0] : memberships.find((membership) => membership.restaurantId === activeRestaurantId) ?? memberships[0];
  const selectionLabel = multiple
    ? selectedRestaurants.length > 1 ? `${selectedRestaurants.length} restaurantes selecionados` : active?.restaurantName ?? "Selecionar restaurantes"
    : active?.restaurantName ?? "Nenhum restaurante";
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const options = memberships.filter((membership) => normalize(membership.restaurantName).includes(normalize(query)));
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) menuRef.current?.removeAttribute("open");
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);

  return (
    <details className={`restaurant-switcher${multiple ? " restaurant-switcher-multiple" : ""}`} ref={menuRef} onKeyDown={(event) => {
      if (!disabled) navigateDetailsMenu(event);
    }}>
      <summary aria-disabled={disabled} onClick={(event) => { if (disabled) event.preventDefault(); }} aria-label={multiple ? `${customLabel ?? "Selecionar restaurantes para comparar"}: ${selectionLabel}` : `Selecionar restaurante: ${selectionLabel}`}>
        <span className="restaurant-switcher-avatar" aria-hidden="true">
          {active?.photoUrl ? <img src={active.photoUrl} alt="" /> : active?.restaurantName.slice(0, 2).toUpperCase() ?? "--"}
        </span>
        <span className="restaurant-switcher-identity"><small>{customLabel ?? (multiple ? "Restaurantes da comparação" : "Restaurante ativo")}</small><strong>{selectionLabel}</strong>{multiple && selectedRestaurants.length > 1 ? <span className="selection-description">{selectedRestaurants.map((restaurant) => restaurant.restaurantName).join(", ")}</span> : null}</span>
        <svg viewBox="0 0 24 24" className="filter-select-chevron" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
      </summary>
      <div className="restaurant-switcher-menu" aria-label={title}>
        <input type="search" aria-label="Buscar restaurante" placeholder="Buscar restaurante" value={query} onChange={(event) => setQuery(event.target.value)} />
        <div className="restaurant-switcher-options">
        {options.map((membership) => {
          const isActive = multiple ? selectedRestaurantIds.includes(membership.restaurantId) : membership.restaurantId === activeRestaurantId;

          return (
            <button
              key={membership.membershipId}
              type="button"
              className={`restaurant-switcher-option ${isActive ? "active" : ""}`}
              aria-pressed={isActive}
              disabled={disabled}
              onClick={() => {
                onActivateRestaurant(membership.restaurantId);
                if (!multiple) {
                  menuRef.current?.removeAttribute("open");
                  setQuery("");
                }
              }}
            >
              <div className="restaurant-switcher-avatar" aria-hidden="true">
                {membership.photoUrl ? (
                  <img src={membership.photoUrl} alt={membership.restaurantName} />
                ) : (
                  <span>{membership.restaurantName.slice(0, 2).toUpperCase()}</span>
                )}
              </div>
              <div className="restaurant-switcher-identity">
                <strong>{membership.restaurantName}</strong>
              </div>
              {multiple ? <span className="restaurant-switcher-check" aria-hidden="true">{isActive ? "✓" : ""}</span> : null}
            </button>
          );
        })}
        {options.length === 0 ? <p className="restaurant-switcher-empty">Nenhum restaurante encontrado.</p> : null}
        </div>
      </div>
    </details>
  );
}

export function DashboardReadOnlyGuide({
  eyebrow,
  title,
  text,
  revenueLabel,
  revenueValue,
  revenueTrend,
  salesChartTitle,
  salesChartHint,
  cmvTitle,
  cmvText,
  alertLabel,
  alertTitle,
  alertText,
  signals,
  bars
}: DashboardReadOnlyGuideProps) {
  return (
    <section className="card dashboard-guide-card">
      <div className="dashboard-guide-copy">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h3>{title}</h3>
          <p>{text}</p>
        </div>

        <div className="dashboard-guide-signal-grid">
          {signals.map((item) => (
            <article key={item.title} className={`dashboard-guide-signal ${item.tone}`}>
              <strong>{item.title}</strong>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </div>

      <div className="dashboard-guide-visual">
        <article className="dashboard-guide-kpi">
          <span>{revenueLabel}</span>
          <strong>{revenueValue}</strong>
          <small>{revenueTrend}</small>
        </article>

        <article className="dashboard-guide-chart bars" aria-label="Exemplo de vendas por grupo">
          <div className="dashboard-guide-chart-head">
            <strong>{salesChartTitle}</strong>
            <span>{salesChartHint}</span>
          </div>
          <div className="dashboard-guide-bars">
            {bars.map((bar) => (
              <div key={bar.label} className="dashboard-guide-bar-row">
                <span>{bar.label}</span>
                <div>
                  <i
                    style={{
                      width: `${bar.value}%`,
                      backgroundColor: bar.color
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="dashboard-guide-chart donut" aria-label="Exemplo de composição de CMV">
          <div className="dashboard-guide-donut" />
          <div>
            <strong>{cmvTitle}</strong>
            <span>{cmvText}</span>
          </div>
        </article>

        <article className="dashboard-guide-alert">
          <span>{alertLabel}</span>
          <strong>{alertTitle}</strong>
          <p>{alertText}</p>
        </article>
      </div>
    </section>
  );
}
