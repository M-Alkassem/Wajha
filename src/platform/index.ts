/**
 * Picks the platform implementation once at startup:
 * Tauri when running inside the desktop shell, the browser build otherwise
 * (and the in-memory one outside browsers, e.g. Node scripts and tests).
 * Owned by the platform/storage work package.
 */
import type { Platform } from './types';
import { createMemoryPlatform } from './memory';
import { createTauriPlatform } from './tauri';
import { createWebPlatform } from './web';

export * from './types';
export * from './limits';
export { createMemoryPlatform, type MemoryPlatform, type MemoryPlatformOptions } from './memory';
export { isAssetId, isImageExt, sniffImageExt } from './paths';
export { sha256Hex } from './sha256';

let current: Platform | null = null;

function detect(): Platform {
  if (typeof window !== 'undefined') return '__TAURI_INTERNALS__' in window ? createTauriPlatform() : createWebPlatform();
  // Web Workers have IndexedDB but no window; Node and test runners have neither.
  return typeof indexedDB !== 'undefined' ? createWebPlatform() : createMemoryPlatform();
}

/** The platform for this process, created on first use. */
export function getPlatform(): Platform {
  current ??= detect();
  return current;
}

/** Tests and the self-test mode can install a specific implementation. */
export function setPlatform(p: Platform): void {
  current = p;
}
