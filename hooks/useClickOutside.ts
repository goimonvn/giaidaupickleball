'use client';

import { useEffect, useRef, type RefObject } from 'react';

/**
 * Close a popover / menu / sheet when the user clicks or touches outside `ref`,
 * or presses Escape. Only listens while `active` is true.
 */
export function useClickOutside<T extends HTMLElement>(ref: RefObject<T>, active: boolean, onOutside: () => void) {
  // Keep the latest callback without re-binding listeners on every render
  const cb = useRef(onOutside);
  cb.current = onOutside;

  useEffect(() => {
    if (!active) return undefined;
    const onDown = (e: Event) => {
      const el = ref.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) cb.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cb.current();
    };
    // pointerdown covers mouse, touch and pen (iOS Safari doesn't send mousedown for taps on
    // non-clickable areas such as a dimmed backdrop). Capture phase so nothing can swallow it.
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, active]);
}
