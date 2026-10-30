/**
 * Library, templates, archives, gallery and settings on top of Platform.
 * Owned by the platform/storage work package. On-disk layout:
 *
 *   projects/<id>/project.json     full Project
 *   projects/<id>/meta.json        ProjectMeta (fast home screen listing)
 *   projects/<id>/thumb.jpg        home screen thumbnail (records the version it shows)
 *   projects/<id>/assets/<asset>   content-addressed images
 *   templates/<id>/template.json   user + installed gallery templates
 *   templates/<id>/preview.jpg
 *   templates/<id>/assets/<asset>
 *   cache/gallery-index.json       last fetched gallery index
 *   settings.json                  AppSettings
 *
 * Failures that the UI may want to explain are StorageError (with a `code`);
 * invalid ids or paths are PlatformError("invalid_path").
 */

/* Library */
export {
  listProjects,
  loadProject,
  saveProject,
  deleteProject,
  duplicateProject,
  readThumbnail,
  writeThumbnail,
  thumbnailVersion,
  onThumbnailWritten,
  readAsset,
  putProjectAsset,
  pruneAssets,
  metaOf,
  type LoadOptions,
  type PruneOptions,
} from './library';

/* Templates (user-saved and installed from the gallery) */
export {
  listUserTemplates,
  saveUserTemplate,
  deleteUserTemplate,
  readTemplatePreview,
  readTemplateAsset,
  copyTemplateAssets,
} from './templates';

/* Archives: ".wajha" projects and ".wajha-template" templates are zip files */
export {
  exportProjectArchive,
  importProjectArchive,
  exportTemplateArchive,
  importTemplateArchive,
  ARCHIVE_MAX_BYTES,
  ARCHIVE_MAX_ENTRIES,
  TEMPLATE_ARCHIVE_MAX_BYTES,
} from './archive';

/* Community gallery */
export { fetchGallery, fetchGalleryPreview, galleryUrl, installGalleryTemplate, GALLERY_TIMEOUT_MS, type GalleryResult } from './gallery';

/* Settings */
export { loadSettings, saveSettings, DEFAULT_SETTINGS } from './settings';

/* Shared */
export { StorageError, type StorageErrorCode } from './shared';
export { collectAssetRefs, usedAssetIds, withPresentAssets } from './refs';
