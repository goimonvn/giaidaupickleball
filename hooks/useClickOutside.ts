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
    const onDown = (e: MouseEvent | TouchEvent) => {
      const el = ref.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) cb.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cb.current();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown, { passive: true });
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, active]);
}
