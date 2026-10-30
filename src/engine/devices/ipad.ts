/** iPad Pro: uniform bezel, front camera centred on the top bezel, top button, volume on the right. */
import type { SlabHardware } from './slab';
import { paintButton, paintLens } from './slab';

const BUTTON_OUT = 0.0042;

export const ipadHardware: SlabHardware = {
  buttons(ctx, L, paint) {
    const out = L.w * BUTTON_OUT;
    paintButton(ctx, 'top', 0, L.w * 0.76, L.w * 0.86, out, paint);
    const limit = L.h - L.radius;
    if (L.w * 0.25 < limit) {
      paintButton(ctx, 'right', L.w, L.w * 0.1, L.w * 0.165, out, paint);
      paintButton(ctx, 'right', L.w, L.w * 0.18, L.w * 0.245, out, paint);
    }
  },
  bezel(ctx, L) {
    const bezel = L.inset - L.band;
    paintLens(ctx, L.w / 2, L.band + bezel / 2, Math.min(L.w * 0.0048, bezel * 0.32));
  },
};
