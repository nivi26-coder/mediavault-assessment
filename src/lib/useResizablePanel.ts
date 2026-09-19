import { useCallback, useEffect, useRef, useState } from 'react';

const KEY_STEP = 20;

/**
 * Drag-to-resize for a panel anchored to the right edge of the window.
 * Width is derived from `window.innerWidth - clientX` while dragging, so it
 * tracks the pointer directly instead of accumulating a delta. Listeners are
 * attached once and gated by a ref rather than added/removed per drag, which
 * keeps cleanup simple (a single effect) and avoids stale-closure bugs.
 */
export function useResizablePanel(defaultWidth: number, min: number, max: number) {
  const [width, setWidth] = useState(defaultWidth);
  const draggingRef = useRef(false);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!draggingRef.current) return;
      const next = window.innerWidth - e.clientX;
      setWidth(Math.min(max, Math.max(min, next)));
    }
    function stopDragging() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', stopDragging);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', stopDragging);
      stopDragging();
    };
  }, [min, max]);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setWidth((w) => Math.min(max, w + KEY_STEP));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setWidth((w) => Math.max(min, w - KEY_STEP));
      }
    },
    [min, max],
  );

  return { width, min, max, startResize, handleKeyDown };
}
