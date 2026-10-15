import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DreAnalysisPanel } from "./drePanels";
import { translations } from "../i18n";
import type { AuthSession, DreImportData, RestaurantMembership } from "../types";

const restaurants: RestaurantMembership[] = [
  { membershipId: "m1", restaurantId: "r1", restaurantName: "Katzsu", role: "viewer" },
  { membershipId: "m2", restaurantId: "r2", restaurantName: "Nosso Ipanema", role: "viewer" }
];
const data: DreImportData = { sheetName: "DRE", sections: [], summary: [], period: { rawLabel: "Out/2026", year: 2026, month: 10 } };
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  sessionStorage.clear();
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render(memberships: RestaurantMembership[]) {
  const session: AuthSession = {
    userId: "test", email: "test@example.com", authMode: "local",
    activeRestaurantId: "r1", activeRestaurantName: "Katzsu", memberships
  };
  await act(async () => root.render(<DreAnalysisPanel
    data={data}
    periods={[{ key: "2026-10", label: "Out/2026", data }]}
    selectedPeriod="2026-10"
    session={session}
    canManageData={false}
    copy={translations.pt}
    onImport={vi.fn()}
    onSelectPeriod={vi.fn()}
  />));
}

describe("DRE comparison selection", () => {
  it("hides the mode switch for a single linked restaurant", async () => {
    await render([restaurants[0]]);
    expect(container.querySelector(".dre-view-mode-switch")).toBeNull();
  });

  it("counts distinct restaurants when deciding whether to show comparison", async () => {
    await render([restaurants[0], { ...restaurants[0], membershipId: "duplicate" }]);
    expect(container.querySelector(".dre-view-mode-switch")).toBeNull();
  });

  it("keeps the menu open for multiple selections and retains at least one restaurant", async () => {
    await render(restaurants);
    await act(async () => container.querySelectorAll<HTMLButtonElement>(".dre-view-mode-switch button")[1].click());
    const menu = container.querySelector<HTMLDetailsElement>(".restaurant-switcher-multiple")!;
    expect(menu).not.toBeNull();
    menu.open = true;
    const options = menu.querySelectorAll<HTMLButtonElement>(".restaurant-switcher-option");
    await act(async () => options[1].click());
    expect(menu.open).toBe(true);
    expect(menu.querySelector("summary")?.textContent).toContain("2 restaurantes selecionados");
    expect([...options].map((option) => option.getAttribute("aria-pressed"))).toEqual(["true", "true"]);
    await act(async () => options[0].click());
    expect(menu.querySelector("summary")?.textContent).toContain("Nosso Ipanema");
    await act(async () => options[1].click());
    expect(options[1].getAttribute("aria-pressed")).toBe("true");
  });
});
