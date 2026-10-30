/**
 * The app's Vite config for the end-to-end server, without file watching or
 * HMR: editing src/ while the suite runs must not hot-reload (or fully
 * reload) the pages under test halfway through a journey.
 *
 * It keeps its own dependency cache: a config that differs from the app's
 * makes Vite re-optimize dependencies, which must never rewrite the cache
 * that other dev servers of this checkout are serving from.
 */
import { mergeConfig } from 'vite';
import base from '../vite.config.ts';

export default mergeConfig(base, {
  cacheDir: 'node_modules/.vite-e2e',
  server: {
    hmr: false,
    watch: null,
  },
});
