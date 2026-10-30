#!/usr/bin/env node
/**
 * Renders the Wajha app icon and regenerates every platform size.
 *
 * The artwork is vector paths only: the shared mark geometry from
 * src/ui/brand/mark.ts (the sunset-lit arched shop window with a phone
 * standing in it) on a deep night squircle, with a soft glow, a horizon sun,
 * a rim-lit phone and a faint reflection on the sill. It is rasterised at
 * 1024 x 1024 with @napi-rs/canvas, following Apple's macOS grid: an 824 px
 * body centred in the canvas, the margin left for the drop shadow.
 *
 *   node scripts/make-icon.mjs                  render, then `tauri icon` into src-tauri/icons
 *   node scripts/make-icon.mjs --png <file>     only write the 1024 px master PNG
 *
 * `tauri icon` runs into a temporary folder and only the desktop files that
 * already live in src-tauri/icons are copied back, so no mobile icon sets
 * are added to the repository.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, Path2D } from '@napi-rs/canvas';
import { ARCH, ARCH_PATH, ISLAND, NIGHT, PHONE, PHONE_PATH, SUNSET_STOPS, roundedRectPath, superellipsePath } from '../src/ui/brand/mark.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SIZE = 1024;
const BODY = 824; // macOS icon body inside the 1024 canvas
const CENTER = SIZE / 2;

/* Arch placement: 52 mark units tall at 10.4 px each, top at y = 206. */
const K = 10.4;
const OX = CENTER - 32 * K;
const OY = 206 - ARCH.top * K;
const SILL_Y = OY + ARCH.bottom * K;

/** A few faint stars, placed by hand so the sky never looks random-noisy. */
const STARS = [
  [236, 214, 2.6, 0.55],
  [292, 318, 1.6, 0.35],
  [780, 236, 2.2, 0.5],
  [842, 352, 1.4, 0.3],
  [198, 432, 1.5, 0.28],
  [708, 168, 1.3, 0.32],
  [338, 170, 1.2, 0.3],
  [866, 470, 1.8, 0.26],
];

function sunsetGradient(ctx) {
  const g = ctx.createLinearGradient(0, ARCH.top, 0, ARCH.bottom);
  for (const [offset, color] of SUNSET_STOPS) g.addColorStop(offset, color);
  return g;
}

/** Arch and phone in mark units (caller sets the transform). `glow` adds the window light. */
function drawMark(ctx, { glow }) {
  const arch = new Path2D(ARCH_PATH);
  const phone = new Path2D(PHONE_PATH);

  ctx.save();
  if (glow) {
    // shadowBlur is in device pixels, unaffected by the mark scale.
    ctx.shadowColor = 'rgba(255, 92, 122, 0.55)';
    ctx.shadowBlur = 90;
  }
  ctx.fillStyle = sunsetGradient(ctx);
  ctx.fill(arch);
  ctx.restore();

  ctx.save();
  ctx.clip(arch);
  // The setting sun sits low behind the phone and warms the sill.
  const sun = ctx.createRadialGradient(32, ARCH.bottom + 2, 0, 32, ARCH.bottom + 2, 27);
  sun.addColorStop(0, 'rgba(255, 232, 180, 0.85)');
  sun.addColorStop(0.42, 'rgba(255, 196, 130, 0.38)');
  sun.addColorStop(1, 'rgba(255, 160, 100, 0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, 64, 64);
  // Glass: a cool sheen from the top-left and a bright inner edge.
  const sheen = ctx.createLinearGradient(ARCH.left, ARCH.top, 34, 34);
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
  sheen.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = sheen;
  ctx.fill(arch);
  const edge = ctx.createLinearGradient(0, ARCH.top, 0, ARCH.bottom);
  edge.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
  edge.addColorStop(0.5, 'rgba(255, 255, 255, 0.12)');
  edge.addColorStop(1, 'rgba(255, 255, 255, 0.05)');
  ctx.strokeStyle = edge;
  ctx.lineWidth = 0.7;
  ctx.stroke(arch);

  // Phone: a soft contact shadow on the glowing glass, then the silhouette.
  ctx.save();
  ctx.shadowColor = 'rgba(30, 6, 40, 0.55)';
  ctx.shadowBlur = 46;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = NIGHT;
  ctx.fill(phone);
  ctx.restore();
  ctx.restore();

  const body = ctx.createLinearGradient(0, PHONE.y, 0, PHONE.y + PHONE.h);
  body.addColorStop(0, '#191233');
  body.addColorStop(1, '#0B0918');
  ctx.fillStyle = body;
  ctx.fill(phone);

  // Screen: inset glass that catches a faint reflection of the sunset.
  const inset = 0.95;
  const screen = new Path2D(roundedRectPath(PHONE.x + inset, PHONE.y + inset, PHONE.w - inset * 2, PHONE.h - inset * 2, PHONE.radius - inset));
  const glass = ctx.createLinearGradient(0, PHONE.y, 0, PHONE.y + PHONE.h);
  glass.addColorStop(0, '#150F2C');
  glass.addColorStop(0.7, '#120D25');
  glass.addColorStop(1, '#2A1430');
  ctx.fillStyle = glass;
  ctx.fill(screen);
  ctx.save();
  ctx.clip(screen);
  const glint = ctx.createLinearGradient(PHONE.x, PHONE.y, PHONE.x + PHONE.w, PHONE.y + PHONE.h * 0.6);
  glint.addColorStop(0, 'rgba(255, 255, 255, 0.07)');
  glint.addColorStop(0.45, 'rgba(255, 255, 255, 0.02)');
  glint.addColorStop(0.46, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = glint;
  ctx.fillRect(PHONE.x, PHONE.y, PHONE.w, PHONE.h);
  ctx.restore();

  // Rim light from the window behind.
  const rim = ctx.createLinearGradient(PHONE.x, PHONE.y, PHONE.x + PHONE.w, PHONE.y + PHONE.h);
  rim.addColorStop(0, 'rgba(255, 214, 190, 0.85)');
  rim.addColorStop(0.5, 'rgba(255, 150, 160, 0.45)');
  rim.addColorStop(1, 'rgba(255, 170, 120, 0.7)');
  ctx.strokeStyle = rim;
  ctx.lineWidth = 0.42;
  ctx.stroke(phone);

  ctx.fillStyle = '#05040A';
  ctx.fill(new Path2D(roundedRectPath(ISLAND.x, ISLAND.y, ISLAND.w, ISLAND.h, ISLAND.h / 2)));
}

/** Renders the 1024 px master icon and returns PNG bytes. */
export function renderIcon() {
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');
  const squircle = new Path2D(superellipsePath(CENTER, CENTER, BODY / 2, 5, 720));

  // Drop shadow, inside Apple's 100 px margin.
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.38)';
  ctx.shadowBlur = 34;
  ctx.shadowOffsetY = 14;
  ctx.fillStyle = '#000000';
  ctx.fill(squircle);
  ctx.restore();

  ctx.save();
  ctx.clip(squircle);

  // Night sky.
  const sky = ctx.createLinearGradient(0, CENTER - BODY / 2, 0, CENTER + BODY / 2);
  sky.addColorStop(0, '#241A52');
  sky.addColorStop(0.5, '#140F2E');
  sky.addColorStop(1, '#09070F');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, SIZE, SIZE);

  const haze = ctx.createRadialGradient(CENTER, 150, 0, CENTER, 150, 520);
  haze.addColorStop(0, 'rgba(124, 108, 255, 0.28)');
  haze.addColorStop(1, 'rgba(124, 108, 255, 0)');
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Window light spilling into the room.
  const spill = ctx.createRadialGradient(CENTER, 560, 0, CENTER, 560, 470);
  spill.addColorStop(0, 'rgba(255, 77, 126, 0.42)');
  spill.addColorStop(0.45, 'rgba(160, 80, 220, 0.16)');
  spill.addColorStop(1, 'rgba(124, 108, 255, 0)');
  ctx.fillStyle = spill;
  ctx.fillRect(0, 0, SIZE, SIZE);

  for (const [x, y, r, a] of STARS) {
    const star = ctx.createRadialGradient(x, y, 0, x, y, r * 2.4);
    star.addColorStop(0, `rgba(255, 255, 255, ${a})`);
    star.addColorStop(0.4, `rgba(230, 225, 255, ${a * 0.55})`);
    star.addColorStop(1, 'rgba(230, 225, 255, 0)');
    ctx.fillStyle = star;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Reflection on a polished floor: the mark flipped below the sill, fading out.
  const mark = createCanvas(SIZE, SIZE);
  const mctx = mark.getContext('2d');
  mctx.translate(OX, OY);
  mctx.scale(K, K);
  drawMark(mctx, { glow: false });
  const reflection = createCanvas(SIZE, SIZE);
  const rctx = reflection.getContext('2d');
  rctx.filter = 'blur(5px)';
  rctx.translate(0, SILL_Y * 2 + 6);
  rctx.scale(1, -1);
  rctx.drawImage(mark, 0, 0);
  rctx.setTransform(1, 0, 0, 1, 0, 0);
  rctx.filter = 'none';
  rctx.globalCompositeOperation = 'destination-in';
  const fade = rctx.createLinearGradient(0, SILL_Y, 0, SILL_Y + 150);
  fade.addColorStop(0, 'rgba(0, 0, 0, 0.3)');
  fade.addColorStop(1, 'rgba(0, 0, 0, 0)');
  rctx.fillStyle = fade;
  rctx.fillRect(0, 0, SIZE, SIZE);
  ctx.drawImage(reflection, 0, 0);

  // The window itself.
  ctx.save();
  ctx.translate(OX, OY);
  ctx.scale(K, K);
  drawMark(ctx, { glow: true });
  ctx.restore();

  // Sill: a thin line of warm light where the arch meets the floor.
  const sill = ctx.createLinearGradient(CENTER - 300, 0, CENTER + 300, 0);
  sill.addColorStop(0, 'rgba(255, 170, 140, 0)');
  sill.addColorStop(0.5, 'rgba(255, 196, 160, 0.6)');
  sill.addColorStop(1, 'rgba(255, 170, 140, 0)');
  ctx.fillStyle = sill;
  ctx.fillRect(CENTER - 300, SILL_Y + 1, 600, 2.5);

  // Vignette and a hairline rim so the squircle reads on dark docks too.
  const vignette = ctx.createRadialGradient(CENTER, CENTER - 40, BODY * 0.3, CENTER, CENTER, BODY * 0.72);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.34)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, SIZE, SIZE);
  const rimLight = ctx.createLinearGradient(0, CENTER - BODY / 2, 0, CENTER + BODY / 2);
  rimLight.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
  rimLight.addColorStop(0.5, 'rgba(255, 255, 255, 0.06)');
  rimLight.addColorStop(1, 'rgba(255, 255, 255, 0.1)');
  ctx.strokeStyle = rimLight;
  ctx.lineWidth = 3;
  ctx.stroke(squircle);
  ctx.restore();

  return canvas.encode('png');
}

function regenerate(master) {
  const iconsDir = join(ROOT, 'src-tauri', 'icons');
  const out = mkdtempSync(join(tmpdir(), 'wajha-icons-'));
  try {
    const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const result = spawnSync(npx, ['tauri', 'icon', master, '-o', out], { cwd: ROOT, stdio: 'inherit' });
    if (result.status !== 0) throw new Error(`tauri icon failed with exit code ${result.status}`);
    const wanted = new Set(readdirSync(iconsDir).filter((f) => statSync(join(iconsDir, f)).isFile()));
    let copied = 0;
    for (const file of readdirSync(out)) {
      const src = join(out, file);
      if (!statSync(src).isFile() || !wanted.has(file)) continue;
      copyFileSync(src, join(iconsDir, file));
      copied++;
    }
    console.log(`Updated ${copied} files in ${iconsDir}`);
  } finally {
    // The temporary folder is ours alone (mkdtemp); leave nothing behind.
    rmSync(out, { recursive: true, force: true });
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const pngArg = argv.indexOf('--png');
  const png = await renderIcon();
  if (pngArg >= 0) {
    const file = resolve(argv[pngArg + 1] ?? 'app-icon.png');
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, png);
    console.log(`Wrote ${file}`);
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), 'wajha-icon-'));
  try {
    const master = join(dir, 'app-icon.png');
    writeFileSync(master, png);
    regenerate(master);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
