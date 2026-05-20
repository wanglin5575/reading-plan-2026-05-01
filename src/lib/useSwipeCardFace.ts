"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** 超过该水平位移且水平占优时视为「横向拖动」，避免与轻点打开预览冲突 */
const PAN_COMMIT_PX = 12;

type DragState = {
  startX: number;
  startY: number;
  origin: number;
  panCommitted: boolean;
};

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
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);

  const resetOffset = useCallback(() => setOffset(0), []);

  useEffect(() => {
    if (!enabled) setOffset(0);
  }, [enabled]);

  /** 标题/摘要链仍可起滑；真实控件上不起滑 */
  const canSwipeFrom = (t: EventTarget | null) =>
    !(t as HTMLElement | null)?.closest?.("button, input, textarea, select, label, summary");

  const tryCommitPan = useCallback((clientX: number, clientY: number) => {
    const d = dragRef.current;
    if (!d) return false;
    if (d.panCommitted) return true;
    const dx = clientX - d.startX;
    const dy = clientY - d.startY;
    if (Math.abs(dx) >= PAN_COMMIT_PX && Math.abs(dx) > Math.abs(dy)) {
      d.panCommitted = true;
      return true;
    }
    return false;
  }, []);

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
      const t = e.touches[0];
      dragRef.current = {
        startX: t.clientX,
        startY: t.clientY,
        origin: offsetRef.current,
        panCommitted: false,
      };
      setDragging(true);
    },
    [enabled],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || !dragRef.current) return;
      const t = e.touches[0];
      if (!tryCommitPan(t.clientX, t.clientY)) return;
      const dx = t.clientX - dragRef.current.startX;
      setOffset(Math.max(-maxRevealPx, Math.min(0, dragRef.current.origin + dx)));
    },
    [enabled, maxRevealPx, tryCommitPan],
  );

  const onTouchEnd = useCallback(() => {
    if (!enabled) return;
    const wasPan = dragRef.current?.panCommitted ?? false;
    dragRef.current = null;
    setDragging(false);
    if (wasPan) suppressClickRef.current = true;
    snap();
  }, [enabled, snap]);

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (!suppressClickRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    suppressClickRef.current = false;
  }, []);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!enabled || e.button !== 0 || !canSwipeFrom(e.target)) return;
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origin: offsetRef.current,
        panCommitted: false,
      };
      setMouseDragging(true);
    },
    [enabled],
  );

  useEffect(() => {
    if (!mouseDragging) return;
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      if (!tryCommitPan(e.clientX, e.clientY)) return;
      const dx = e.clientX - dragRef.current.startX;
      setOffset(Math.max(-maxRevealPx, Math.min(0, dragRef.current.origin + dx)));
    };
    const onUp = () => {
      const wasPan = dragRef.current?.panCommitted ?? false;
      dragRef.current = null;
      setMouseDragging(false);
      if (wasPan) suppressClickRef.current = true;
      snap();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [mouseDragging, maxRevealPx, snap, tryCommitPan]);

  return {
    style,
    resetOffset,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onMouseDown,
    onClickCapture,
  };
}
