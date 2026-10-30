/**
 * Browser-side runtime services shared by the UI. Owned by the runtime work package.
 *
 *   images.ts     ImageCache: decodes assets, keeps memory-bounded preview
 *                 bitmaps (LRU), loads full-resolution images for export
 *   fonts.ts      ensureFonts before drawing (the bundled @font-face rules
 *                 are registered by src/fonts.ts)
 *   env.ts        browser RenderEnv (scratch canvases)
 *   importer.ts   importImages: files -> stored assets + AssetInfo (decoded size)
 *   renderer.ts   renderToCanvas / renderJobBytes / renderThumbnail
 *   autosave.ts   debounced project saving + thumbnail refresh
 *
 * Internal helpers: canvas.ts (canvas creation and encoding), decode.ts
 * (image decoding and downscaling), lru.ts (byte-budget LRU), util.ts.
 */

/* images.ts */
export type { ImageCacheApi, ImageCache, ImageCacheOptions, ImageDecoder, PreviewState } from './images';
export {
  getImageCache,
  waitForPreviews,
  setAssetReader,
  createImageCache,
  browserDecoder,
  PREVIEW_MAX_SIDE,
  PREVIEW_BUDGET_BYTES,
} from './images';

/* fonts.ts */
export type { FontLoadRequest } from './fonts';
export { ensureFonts, onFontsChanged, fontLoadRequests } from './fonts';

/* env.ts */
export { browserEnv } from './env';

/* importer.ts */
export type { ImportFile, ImportReport, ImportSkipReason, SkippedImport, ImageSize } from './importer';
export {
  importImages,
  pickAndImportImages,
  importImagesWithReport,
  pickAndImportImagesWithReport,
  sniffImageType,
  readImageSize,
  MAX_IMPORT_BYTES,
} from './importer';

/* renderer.ts */
export type { CanvasRenderRequest, RenderedJob, ThumbnailLayout } from './renderer';
export { renderToCanvas, renderJobBytes, renderJobWithResult, renderThumbnail, thumbnailLayout, slideAssetIds } from './renderer';

/* autosave.ts */
export type { AutosaveHandle, AutosaveOptions, AutosaveStatus } from './autosave';
export { startAutosave, AUTOSAVE_DELAY_MS } from './autosave';
