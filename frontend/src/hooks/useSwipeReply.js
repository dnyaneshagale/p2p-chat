import { useCallback, useRef, useState } from "react";

export const DEFAULT_REPLY_THRESHOLD = 64;
export const DEFAULT_MAX_DRAG = 80;

export function useSwipeReply(onReply, message, options = {}) {
  const threshold = options.threshold ?? DEFAULT_REPLY_THRESHOLD;
  const maxDrag = options.maxDrag ?? DEFAULT_MAX_DRAG;

  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);

  const dragStart = useRef(null);
  const thresholdHit = useRef(false);

  const onPointerDown = useCallback((e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target.closest("button, a, audio")) return;
    dragStart.current = { clientX: e.clientX };
    thresholdHit.current = false;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e) => {
    if (!dragStart.current) return;
    const dx = Math.max(0, Math.min(e.clientX - dragStart.current.clientX, maxDrag));
    setDragX(dx);
    if (dx >= threshold && !thresholdHit.current) {
      thresholdHit.current = true;
      if (navigator.vibrate) navigator.vibrate(30);
    }
  }, [maxDrag, threshold]);

  const onPointerUp = useCallback(() => {
    if (!dragStart.current) return;
    const fired = thresholdHit.current;
    dragStart.current = null;
    thresholdHit.current = false;
    setDragging(false);
    setDragX(0);
    if (fired) onReply?.(message);
  }, [message, onReply]);

  const onPointerCancel = useCallback(() => {
    dragStart.current = null;
    thresholdHit.current = false;
    setDragging(false);
    setDragX(0);
  }, []);

  return {
    dragX,
    dragging,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    threshold,
  };
}
