'use client';

import { useEffect, useRef, useState } from 'react';

export interface ScrollDirectionOptions {
  /** Minimum scroll distance (px) before the bars toggle. Filters out finger jitter. Default 15. */
  threshold?: number;
  /** Bars always stay visible above this scroll position (px). Default 56. */
  topOffset?: number;
  /** Keep bars visible (e.g. while a menu or sheet is open). */
  disabled?: boolean;
}

/**
 * Facebook-style auto-hiding bars.
 *
 * Returns `true` while the user scrolls DOWN (hide header with `-translate-y-full`
 * and bottom nav with `translate-y-full`), `false` as soon as they scroll UP by at
 * least `threshold` px, or are near the top of the page.
 *
 * rAF-throttled, passive listener, SSR-safe (starts visible).
 */
export function useScrollDirection({ threshold = 15, topOffset = 56, disabled = false }: ScrollDirectionOptions = {}) {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    if (disabled) {
      setHidden(false);
      return undefined;
    }
    lastY.current = Math.max(0, window.scrollY);

    const update = () => {
      ticking.current = false;
      const y = Math.max(0, window.scrollY);
      const delta = y - lastY.current;
      if (y < topOffset) {
        setHidden(false);
        lastY.current = y;
      } else if (Math.abs(delta) >= threshold) {
        setHidden(delta > 0);
        lastY.current = y;
      }
    };
    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      window.requestAnimationFrame(update);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold, topOffset, disabled]);

  return hidden;
}
