import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

export function activateChartMark(event: KeyboardEvent<SVGElement>) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    event.currentTarget.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }
}

export function useChartDetails<T>() {
  const chartRef = useRef<HTMLElement>(null);
  const pinned = useRef(false);
  const [details, setDetails] = useState<T>();
  const [anchor, setAnchor] = useState<{ x: number; y: number }>();
  useEffect(() => {
    const pointerDown = (event: PointerEvent) => {
      const target = event.target as Element;
      if (!chartRef.current?.contains(target) || !target.closest('svg [role="button"], .dre-donut-legend-row')) {
        pinned.current = false;
        setDetails(undefined);
      } else {
        pinned.current = event.pointerType === "touch";
        setAnchor({ x: event.clientX, y: event.clientY });
      }
    };
    const pointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "touch" && chartRef.current?.contains(event.target as Node)) {
        setAnchor({ x: event.clientX, y: event.clientY });
      }
    };
    const keyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setDetails(undefined);
    };
    const focusIn = (event: FocusEvent) => {
      if (!chartRef.current?.contains(event.target as Node)) setDetails(undefined);
      else {
        if (!(event.target as Element).closest('svg [role="button"], .dre-donut-legend-row')) setDetails(undefined);
        const bounds = (event.target as Element).getBoundingClientRect();
        setAnchor({ x: bounds.left + bounds.width / 2, y: bounds.bottom });
      }
    };
    document.addEventListener("pointerdown", pointerDown);
    document.addEventListener("pointermove", pointerMove);
    document.addEventListener("keydown", keyDown);
    document.addEventListener("focusin", focusIn);
    return () => {
      document.removeEventListener("pointerdown", pointerDown);
      document.removeEventListener("pointermove", pointerMove);
      document.removeEventListener("keydown", keyDown);
      document.removeEventListener("focusin", focusIn);
    };
  }, []);
  return { chartRef, details, setDetails, anchor, onMouseLeave: () => { if (!pinned.current) setDetails(undefined); } };
}
