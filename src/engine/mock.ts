/**
 * Mock screens: deterministic fake apps shown in every device until the
 * user drops in a screenshot. They are what template previews show, so
 * they are drawn like polished product shots: real layouts, soft cards,
 * charts and photos, in the project palette, light or dark.
 *
 * Text is language-neutral (skeleton bars), except digits. Ten app types
 * are picked by seed; phones get a status bar and tab bar, tablets a
 * sidebar split view, desktops (family "mac" or any wide screen) a
 * sidebar + toolbar shell without status bar.
 */
import type { Color, FamilyId } from '../model/types';
import type { Ctx2D, DrawMockScreenFn } from './types';
import { rgba } from './color';
import { APPS } from './devices/mock/apps';
import { desktopShell, homeIndicator, statusBar, statusHeight, tabBar, tabBarHeight, tabletShell, webShell } from './devices/mock/chrome';
import type { Form, Mk } from './devices/mock/kit';
import { linear } from './devices/mock/kit';
import { createRng } from './devices/mock/rng';
import { mockTheme } from './devices/mock/theme';
import type { MockArchetypeId } from './devices/mock/widgets';
import { currentScale } from './devices/shadow';

export type { MockArchetypeId } from './devices/mock/widgets';
export type MockLayout = Form;

export interface MockScreenOptions {
  seed: number;
  palette: Color[];
  dark: boolean;
  family?: FamilyId;
  /** "web": drawn inside a browser window, so no status bar or window controls. */
  chrome?: 'device' | 'web';
}

/** Point widths the mock is designed at; the context is scaled to the real width. */
const DESIGN_WIDTH: Record<Form, number> = { phone: 390, tablet: 820, desktop: 1280 };

/** Layouts fill at most this many widths of height; anything taller is plain background. */
const MAX_LAYOUT_ASPECT = 8;

const SEED_SPAN = 1_000_000;

const ANDROID: ReadonlySet<FamilyId | undefined> = new Set<FamilyId | undefined>(['android-phone', 'android-tablet', 'play-feature']);

function seedIndex(seed: number): number {
  const k = Number.isFinite(seed) ? Math.floor(seed) : 0;
  const n = APPS.length;
  return ((k % n) + n) % n;
}

/** Which app a seed shows. Consecutive seeds always show different apps. */
export function mockArchetype(seed: number): MockArchetypeId {
  return APPS[seedIndex(seed)].id;
}

/** Every app type, in seed order. */
export const MOCK_ARCHETYPES: readonly MockArchetypeId[] = APPS.map((a) => a.id);

/** Phone, tablet split view or desktop shell for a screen size and family. */
export function mockLayoutMode(width: number, height: number, family?: FamilyId): MockLayout {
  if (family === 'mac' || width > height) return 'desktop';
  if (family === 'ipad' || family === 'android-tablet') return 'tablet';
  if (family === 'iphone' || family === 'android-phone' || family === 'play-feature') return 'phone';
  return height / width < 1.6 ? 'tablet' : 'phone';
}

/** Neutralises context state a caller may have left behind, inside the caller's save(). */
function resetState(ctx: Ctx2D): void {
  ctx.shadowColor = 'rgba(0, 0, 0, 0)';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineWidth = 1;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  if (typeof ctx.setLineDash === 'function') ctx.setLineDash([]);
  if ('direction' in ctx) ctx.direction = 'ltr';
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

/**
 * Fills (0, 0, width, height) with a mock app. Deterministic for a given
 * seed, palette, appearance, family and size. Restores the context.
 */
export function paintMockScreen(ctx: Ctx2D, width: number, height: number, opts: MockScreenOptions): void {
  if (!(width > 0) || !(height > 0) || !Number.isFinite(width) || !Number.isFinite(height)) return;
  const form = mockLayoutMode(width, height, opts.family);
  const os = ANDROID.has(opts.family) ? 'android' : 'ios';
  const chrome = opts.chrome ?? 'device';
  const W = DESIGN_WIDTH[form];
  const s = width / W;
  const fullH = height / s;
  // Bounds every fill-to-the-bottom loop, whatever size a caller passes.
  const H = Math.min(fullH, W * MAX_LAYOUT_ASPECT);
  const app = APPS[seedIndex(opts.seed)];
  // Apps index arrays with the seed; keep it a small non-negative integer.
  const k = Number.isFinite(opts.seed) ? Math.floor(opts.seed) : 0;
  const seed = ((k % SEED_SPAN) + SEED_SPAN) % SEED_SPAN;
  const t = mockTheme(Array.isArray(opts.palette) ? opts.palette : [], !!opts.dark);

  ctx.save();
  resetState(ctx);
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.clip();
  ctx.scale(s, s);
  const m: Mk = { ctx, t, rng: createRng(seed * 7 + 1), px: currentScale(ctx), os, form, seed };
  const full = { x: 0, y: 0, w: W, h: H };
  const shell = { nav: app.nav, selected: 0, glyph: app.glyph };

  ctx.fillStyle = t.bg;
  ctx.fillRect(0, 0, W, fullH);
  if (app.backdrop && form !== 'desktop') app.backdrop(m, W, H);
  const ink = app.ink && form === 'phone' ? app.ink(m) : t.text;

  if (form === 'desktop') {
    const area = chrome === 'web' ? webShell(m, W, H, shell) : desktopShell(m, W, H, shell, opts.family === 'mac');
    app.wide(m, area);
  } else if (form === 'tablet') {
    const top = chrome === 'web' ? 12 : statusHeight(m);
    const area = tabletShell(m, W, H, top, shell);
    // Keep wide content (halos, full-bleed maps) from spilling over the sidebar.
    ctx.save();
    ctx.beginPath();
    ctx.rect(area.x - 8, 0, W - area.x + 8, H);
    ctx.clip();
    app.narrow(m, { ...area, h: area.h - 24 }, area);
    ctx.restore();
    if (chrome === 'device') {
      statusBar(m, W, ink);
      homeIndicator(m, W, H, t.text);
    }
  } else {
    const top = chrome === 'web' ? 8 : statusHeight(m);
    const bottom = app.tabs ? tabBarHeight(m) : os === 'ios' ? 34 : 24;
    app.narrow(m, { x: 0, y: top, w: W, h: H - top - bottom }, full);
    if (app.tabs) {
      // Scroll-edge effect: content fades out under the tab bar, as on iOS 26 / Material 3.
      const fadeTop = H - tabBarHeight(m) - 30;
      ctx.fillStyle = linear(m, 0, fadeTop, 0, H - 40, [
        [0, rgba(t.bg, 0)],
        [1, rgba(t.bg, 0.97)],
      ]);
      ctx.fillRect(0, fadeTop, W, H - fadeTop);
      tabBar(m, W, H, app.tabs, app.tabSelected);
    }
    if (chrome === 'device') {
      statusBar(m, W, ink);
      homeIndicator(m, W, H, app.tabs ? t.text : ink);
    }
  }
  ctx.restore();
}

/** Contract entry point (see engine/types.ts). */
export const drawMockScreen: DrawMockScreenFn = (ctx, width, height, opts) => paintMockScreen(ctx, width, height, opts);
