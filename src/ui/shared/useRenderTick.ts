import { useEffect, useState } from 'react';
import { getImageCache, onFontsChanged } from '../../runtime';

/**
 * A counter that increases whenever a preview image finishes decoding or a
 * web font finishes loading. Include it in a canvas's render dependencies so
 * slides repaint as their assets arrive.
 */
export function useRenderTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    const offImages = getImageCache().subscribe(bump);
    const offFonts = onFontsChanged(bump);
    return () => {
      offImages();
      offFonts();
    };
  }, []);
  return tick;
}
