import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PeriodSelector } from "./periodSelector";

const periods = [
  { key: "2025-12", label: "Dez/2025", year: 2025 },
  { key: "2026-01", label: "Jan/2026", year: 2026 },
  { key: "2026-02", label: "Fev/2026", year: 2026 }
];
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("period selection", () => {
  it("opens month options with arrows and returns focus with Escape", () => {
    act(() => root.render(<PeriodSelector periods={periods} selectedKeys={["2026-01"]} onSelect={vi.fn()} />));
    const summary = container.querySelector("summary")!;
    act(() => summary.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    expect(container.querySelector("details")!.open).toBe(true);
    expect(document.activeElement).toBe(container.querySelector(".analysis-month-option"));
    act(() => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(container.querySelector("details")!.open).toBe(false);
    expect(document.activeElement).toBe(summary);
  });

  it("selects all available months in the current year and removes only additional selections", () => {
    const onSelect = vi.fn();
    act(() => root.render(<PeriodSelector periods={periods} selectedKeys={["2026-01"]} multiple onSelect={onSelect} />));
    act(() => container.querySelectorAll<HTMLButtonElement>(".selection-quick-actions button")[0].click());
    expect(onSelect).toHaveBeenLastCalledWith(["2026-01", "2026-02"]);
    act(() => root.render(<PeriodSelector periods={periods} selectedKeys={["2026-01", "2026-02"]} multiple onSelect={onSelect} />));
    expect(container.querySelector(".selection-description")?.textContent).toBe("Jan/2026, Fev/2026");
    act(() => container.querySelectorAll<HTMLButtonElement>(".selection-quick-actions button")[1].click());
    expect(onSelect).toHaveBeenLastCalledWith(["2026-02"]);
  });

  it("changes year and restricts the month options to that year", () => {
    const onSelect = vi.fn();
    act(() => root.render(<PeriodSelector periods={periods} selectedKeys={["2026-01"]} onSelect={onSelect} />));
    const year = container.querySelector("select")!;
    act(() => {
      year.value = "2025";
      year.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onSelect).toHaveBeenCalledWith(["2025-12"]);
    act(() => root.render(<PeriodSelector periods={periods} selectedKeys={["2025-12"]} onSelect={onSelect} />));
    expect(container.querySelector(".analysis-month-options")?.textContent).toContain("Dez/2025");
    expect(container.querySelector(".analysis-month-options")?.textContent).not.toContain("Jan/2026");
  });

  it("allows multiple months while retaining at least one selection", () => {
    const onSelect = vi.fn();
    act(() => root.render(<PeriodSelector periods={periods} selectedKeys={["2026-01"]} multiple onSelect={onSelect} />));
    const options = container.querySelectorAll<HTMLButtonElement>(".analysis-month-option");
    act(() => options[1].click());
    expect(onSelect).toHaveBeenLastCalledWith(["2026-01", "2026-02"]);
    act(() => options[0].click());
    expect(onSelect).toHaveBeenLastCalledWith(["2026-01"]);
  });

  it("removes a period without changing the selected months and closes the menu", () => {
    const onSelect = vi.fn();
    const onRemove = vi.fn();
    act(() => root.render(<PeriodSelector periods={periods} selectedKeys={["2026-01"]} onSelect={onSelect} onRemove={onRemove} />));
    container.querySelector("details")!.open = true;
    act(() => container.querySelector<HTMLButtonElement>(".analysis-period-remove")!.click());
    expect(onRemove).toHaveBeenCalledWith("2026-01");
    expect(onSelect).not.toHaveBeenCalled();
    expect(container.querySelector("details")!.open).toBe(false);
  });
});
