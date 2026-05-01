"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 横向左滑露出底栏按钮（待读列表卡片、随览卡片等共用）
 * @param maxRevealPx 底栏总露出宽度（单钮约 76，双钮约 148）
 */
export function useSwipeCardFace(enabled: boolean, maxRevealPx: number) {
  const [offset, setOffset] = useState(0);
  const offsetRef = useRef(0);
  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  const [dragging, setDragging] = useState(false);
  const [mouseDragging, setMouseDragging] = useState(false);
  const dragRef = useRef<{ start: number; origin: number } | null>(null);

  const resetOffset = useCallback(() => setOffset(0), []);

  useEffect(() => {
    if (!enabled) setOffset(0);
  }, [enabled]);

  const canSwipeFrom = (t: EventTarget | null) =>
    !(t as HTMLElement | null)?.closest?.("a, button, input, textarea, select, label, summary");

  const snap = useCallback(() => {
    setOffset((o) => (o < -maxRevealPx / 2 ? -maxRevealPx : 0));
  }, [maxRevealPx]);

  const style: React.CSSProperties = {
    transform: `translateX(${offset}px)`,
    transition: dragging || mouseDragging ? "none" : "transform 0.2s ease",
  };

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || !canSwipeFrom(e.target)) return;
      dragRef.current = { start: e.touches[0].clientX, origin: offsetRef.current };
      setDragging(true);
    },
    [enabled],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || !dragRef.current) return;
      const dx = e.touches[0].clientX - dragRef.current.start;
      setOffset(Math.max(-maxRevealPx, Math.min(0, dragRef.current.origin + dx)));
    },
    [enabled, maxRevealPx],
  );

  const onTouchEnd = useCallback(() => {
    if (!enabled) return;
    dragRef.current = null;
    setDragging(false);
    snap();
  }, [enabled, snap]);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!enabled || e.button !== 0 || !canSwipeFrom(e.target)) return;
      dragRef.current = { start: e.clientX, origin: offsetRef.current };
      setMouseDragging(true);
    },
    [enabled],
  );

  useEffect(() => {
    if (!mouseDragging) return;
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.start;
      setOffset(Math.max(-maxRevealPx, Math.min(0, dragRef.current.origin + dx)));
    };
    const onUp = () => {
      dragRef.current = null;
      setMouseDragging(false);
      snap();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [mouseDragging, maxRevealPx, snap]);

  return {
    style,
    resetOffset,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onMouseDown,
  };
}
