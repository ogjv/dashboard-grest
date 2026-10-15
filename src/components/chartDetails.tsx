import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";


export function ChartDetails({ children, anchor }: { children: ReactNode; anchor?: { x: number; y: number } }) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 12, top: 12 });
  useLayoutEffect(() => {
    const bounds = tooltipRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const x = anchor?.x ?? viewportWidth / 2;
    const y = anchor?.y ?? viewportHeight / 2;
    setPosition({
      left: Math.max(12, Math.min(x + 14, viewportWidth - bounds.width - 12)),
      top: Math.max(12, Math.min(y + 14, viewportHeight - bounds.height - 12))
    });
  }, [anchor, children]);
  return createPortal(<div className="chart-details-popover" role="status" ref={tooltipRef} style={position}>{children}</div>, document.body);
}
