'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Facebook-style auto-hiding bars.
 * Returns `hidden = true` while the user scrolls DOWN, `false` as soon as they scroll UP
 * (or are near the top of the page). rAF-throttled, passive listener.
 */
export function useScrollDirection({ threshold = 8, topOffset = 64, disabled = false } = {}) {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    if (disabled) { setHidden(false); return undefined; }
    lastY.current = window.scrollY;

    const update = () => {
      const y = Math.max(0, window.scrollY);
      const delta = y - lastY.current;
      if (y < topOffset) setHidden(false);
      else if (Math.abs(delta) >= threshold) {
        setHidden(delta > 0);
        lastY.current = y;
      }
      ticking.current = false;
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
