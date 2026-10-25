"use client";

import { useEffect, useRef } from "react";

/**
 * The day strip starts in the past: on a phone, scroll it so the selected day is
 * centred instead of hidden off-screen. Only the strip scrolls, not the page.
 */
export function StripScroller({
  selected,
  className,
  children,
}: {
  selected: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Only when the selected day changes: the page auto-refreshes, and a manual scroll must stay put.
  useEffect(() => {
    const strip = ref.current;
    const active = strip?.querySelector<HTMLElement>("[aria-current]");
    if (!strip || !active) return;
    strip.scrollLeft = active.offsetLeft - strip.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2;
  }, [selected]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
