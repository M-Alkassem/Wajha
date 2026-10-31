/** Apple Watch: Digital Crown and side button on the right edge; TVs have no hardware to draw. */
import type { SlabHardware } from './slab';
import { paintButton } from './slab';

export const watchHardware: SlabHardware = {
  buttons(ctx, L, paint) {
    // Digital Crown: wide and proud of the case, a third of the way down.
    paintButton(ctx, 'right', L.w, L.h * 0.22, L.h * 0.38, L.w * 0.055, paint);
    // Side button below it, flatter and longer.
    paintButton(ctx, 'right', L.w, L.h * 0.5, L.h * 0.68, L.w * 0.022, paint);
  },
};

export const tvHardware: SlabHardware = {};
