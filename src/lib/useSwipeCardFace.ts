"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** 向左滑超过该距离且水平占优时，才视为「露出底栏按钮」 */
const PAN_COMMIT_PX = 12;

type DragState = {
  startX: number;
  startY: number;
  origin: number;
  panCommitted: boolean;
};

/** 仅向左滑（dx 为负）时提交横向拖动，向右拖留给浏览器选字 */
function shouldCommitLeftPan(dx: number, dy: number, alreadyCommitted: boolean): boolean {
  if (alreadyCommitted) return true;
  return dx <= -PAN_COMMIT_PX && Math.abs(dx) > Math.abs(dy);
}

/**
 * 横向左滑露出底栏按钮（待读列表卡片、随览卡片等共用）。
 * 向右拖 / 选字不触发滑动手势；桌面端同样支持从左往右拖选复制。
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

  /** 链接、表单控件上不起滑，便于点按与选字 */
  const canSwipeFrom = (t: EventTarget | null) =>
    !(t as HTMLElement | null)?.closest?.("button, input, textarea, select, label, summary, a");

  const applyPanDx = useCallback(
    (dx: number) => {
      const d = dragRef.current;
      if (!d) return;
      setOffset(Math.max(-maxRevealPx, Math.min(0, d.origin + dx)));
    },
    [maxRevealPx],
  );

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
      const dx = t.clientX - dragRef.current.startX;
      const dy = t.clientY - dragRef.current.startY;
      if (!shouldCommitLeftPan(dx, dy, dragRef.current.panCommitted)) return;
      dragRef.current.panCommitted = true;
      applyPanDx(dx);
    },
    [enabled, applyPanDx],
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
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (!shouldCommitLeftPan(dx, dy, d.panCommitted)) return;
      d.panCommitted = true;
      applyPanDx(dx);
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
  }, [mouseDragging, applyPanDx, snap]);

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
