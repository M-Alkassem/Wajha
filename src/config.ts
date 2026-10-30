/** App-wide constants. REPO_OWNER / REPO_NAME name the GitHub repository (links and the community gallery). */
export const APP_NAME = 'Wajha';
export const APP_NAME_AR = 'واجهة';
export const REPO_OWNER = 'M-Alkassem';
export const REPO_NAME = 'Wajha';
export const REPO_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}`;

/**
 * Community template gallery. Served from the repository's `gallery/` folder
 * through the jsDelivr CDN, so it costs nothing to host. In development and
 * in the browser build used by end-to-end tests, Vite serves the local
 * `gallery/` folder at `/gallery/` instead.
 */
export const GALLERY_BASE_URL: string =
  (import.meta.env.VITE_GALLERY_URL as string | undefined) ??
  (import.meta.env.DEV ? '/gallery/' : `https://cdn.jsdelivr.net/gh/${REPO_OWNER}/${REPO_NAME}@main/gallery/`);

/** File extensions. */
export const PROJECT_EXT = 'wajha';
export const TEMPLATE_EXT = 'wajha-template';
