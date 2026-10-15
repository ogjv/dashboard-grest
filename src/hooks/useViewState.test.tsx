import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useViewState } from "./useViewState";

let container: HTMLDivElement;
let root: Root;
function View({ scope }: { scope: string }) {
  const [value, setValue] = useViewState(scope, "revenue");
  return <button onClick={() => setValue("margin")}>{value}</button>;
}
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  sessionStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

it("restores the selected indicator after leaving and returning to a view", () => {
  act(() => root.render(<View scope="user-one.restaurant-a.dre" />));
  act(() => container.querySelector("button")!.click());
  act(() => root.unmount());
  root = createRoot(container);
  act(() => root.render(<View scope="user-one.restaurant-a.dre" />));
  expect(container.textContent).toBe("margin");
});

it("isolates choices by restaurant and user without overwriting another scope", () => {
  act(() => root.render(<View scope="user-one.restaurant-a" />));
  act(() => container.querySelector("button")!.click());
  act(() => root.render(<View scope="user-one.restaurant-b" />));
  expect(container.textContent).toBe("revenue");
  act(() => root.render(<View scope="user-two.restaurant-a" />));
  expect(container.textContent).toBe("revenue");
  act(() => root.render(<View scope="user-one.restaurant-a" />));
  expect(container.textContent).toBe("margin");
});

it("keeps filters functional if browser storage is full or unavailable", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Quota exceeded"); });
  act(() => root.render(<View scope="blocked-storage" />));
  act(() => container.querySelector("button")!.click());
  expect(container.textContent).toBe("margin");
});
