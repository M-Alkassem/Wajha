/**
 * Engine entry point. Implementations live in sibling modules:
 *   render.ts      renderSlide (scene composition)
 *   background.ts  slide backgrounds incl. panorama windows
 *   paint.ts       the Fill painter (solid, linear, radial, mesh, image)
 *   patterns.ts    background patterns
 *   shapes.ts      circle / rect / blob / ring, soft glows
 *   images.ts      image elements
 *   text.ts        layoutText / drawTextBlock (markup.ts, linebreak.ts, bidi.ts)
 *   devices/       deviceGeometry / drawDevice
 *   mock.ts        drawMockScreen
 *   cache.ts       bounded caches shared by the painters
 */
export type * from './types';
export { mockSeed, renderSlide } from './render';
export { layoutText } from './text';
export { deviceGeometry, drawDevice } from './devices';
export { drawMockScreen } from './mock';
export { parseMarkup, plainText } from './markup';
export { clearEngineCaches } from './cache';
