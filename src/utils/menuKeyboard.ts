import type { KeyboardEvent } from "react";

export function navigateDetailsMenu(event: KeyboardEvent<HTMLDetailsElement>) {
  const menu = event.currentTarget;
  if (event.key === "Escape") {
    menu.open = false;
    menu.querySelector("summary")?.focus();
    return;
  }
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  if (event.target instanceof HTMLInputElement && (event.key === "Home" || event.key === "End")) return;
  event.preventDefault();
  menu.open = true;
  const options = [...menu.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
  if (options.length === 0) return;
  const current = options.indexOf(document.activeElement as HTMLButtonElement);
  const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1
    : event.key === "ArrowDown" ? (current + 1) % options.length
    : current <= 0 ? options.length - 1 : current - 1;
  options[next].focus();
}
