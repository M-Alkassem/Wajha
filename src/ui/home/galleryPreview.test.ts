import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GalleryEntry } from '../../model/types';
import { galleryUrl } from '../../storage';
import { jpeg, png, webp } from '../../storage/fixtures.node';
import { showGalleryPreview } from './galleryPreview';

function entry(id: string, preview = `templates/${id}/preview.jpg`): GalleryEntry {
  return {
    id,
    name: id,
    author: 'Kit',
    description: '',
    category: 'dark',
    tags: [],
    version: 1,
    template: `templates/${id}/template.json`,
    preview,
    assets: [],
    bytes: 1,
  };
}

const PREVIEW = { width: 1200, height: 750 };

/** A gallery that answers only when the test says so (`answer`), as a slow network would. */
function gallery(bodies: Record<string, () => Uint8Array | null>) {
  const waiting: Array<() => void> = [];
  const fetchMock = vi.fn(
    (input: RequestInfo | URL, _init?: RequestInit) =>
      new Promise<Response>((resolve) => {
        waiting.push(() => {
          const body = bodies[String(input)]?.();
          resolve(body ? new Response(body.slice()) : new Response('not found', { status: 404 }));
        });
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return {
    fetchMock,
    /** Answers every request made so far, and lets the cards see the result. */
    async answer() {
      for (const reply of waiting.splice(0)) reply();
      // Reading the body and checking its header settle within one turn of the event loop.
      await new Promise((r) => setTimeout(r, 0));
    },
  };
}

let created: string[];
let revoked: string[];
let blobs: Blob[];

beforeEach(() => {
  created = [];
  revoked = [];
  blobs = [];
  let n = 0;
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    blobs.push(blob as Blob);
    const url = `blob:test/${++n}`;
    created.push(url);
    return url;
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => {
    revoked.push(url);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('showGalleryPreview', () => {
  it('shows the checked bytes through one object URL and revokes it when the card lets go', async () => {
    const bytes = jpeg(1, 256, PREVIEW);
    const net = gallery({ [galleryUrl('templates/neon/preview.jpg')]: () => bytes });
    const show = vi.fn();
    const stop = showGalleryPreview(entry('neon'), show);
    expect(show).not.toHaveBeenCalled();
    await net.answer();
    expect(show).toHaveBeenCalledExactlyOnceWith('blob:test/1');
    expect(blobs[0].type).toBe('image/jpeg');
    expect(new Uint8Array(await blobs[0].arrayBuffer())).toEqual(bytes);
    // Downloaded like every gallery file: no cookies.
    expect(net.fetchMock.mock.calls[0][1]?.credentials).toBe('omit');
    stop();
    expect(revoked).toEqual(['blob:test/1']);
    stop();
    expect(revoked).toEqual(['blob:test/1']);
  });

  it('labels PNG and WebP previews with their own type', async () => {
    const net = gallery({
      [galleryUrl('templates/a/preview.png')]: () => png(2, 128, PREVIEW),
      [galleryUrl('templates/b/preview.webp')]: () => webp(3, 128, PREVIEW),
    });
    const stops = [showGalleryPreview(entry('a', 'templates/a/preview.png'), vi.fn()), showGalleryPreview(entry('b', 'templates/b/preview.webp'), vi.fn())];
    await net.answer();
    expect(blobs.map((b) => b.type)).toEqual(['image/png', 'image/webp']);
    for (const stop of stops) stop();
  });

  it('shows nothing for a preview the webview must not decode, or that cannot be had', async () => {
    const net = gallery({
      // A decompression bomb: a small file whose header claims 30 000 x 30 000 px.
      [galleryUrl('templates/bomb/preview.jpg')]: () => png(1, 64, { width: 30000, height: 30000 }),
      [galleryUrl('templates/text/preview.jpg')]: () => new TextEncoder().encode('<html>captive portal</html>'),
    });
    const shows = ['bomb', 'text', 'gone'].map((id) => {
      const show = vi.fn();
      showGalleryPreview(entry(id), show);
      return show;
    });
    await net.answer();
    for (const show of shows) expect(show).toHaveBeenCalledExactlyOnceWith(null);
    expect(created).toEqual([]);
  });

  it('creates no URL for a card that let go before its preview arrived', async () => {
    const net = gallery({ [galleryUrl('templates/neon/preview.jpg')]: () => jpeg(1, 256, PREVIEW) });
    const show = vi.fn();
    const stop = showGalleryPreview(entry('neon'), show);
    stop();
    await net.answer();
    expect(show).not.toHaveBeenCalled();
    expect(created).toEqual([]);
  });

  it('downloads once for cards that ask at once, and keeps nothing after', async () => {
    const net = gallery({ [galleryUrl('templates/neon/preview.jpg')]: () => jpeg(1, 256, PREVIEW) });
    // StrictMode runs the effect, lets go and runs it again before anything arrived.
    showGalleryPreview(entry('neon'), vi.fn())();
    const show = vi.fn();
    const stop = showGalleryPreview(entry('neon'), show);
    await net.answer();
    expect(net.fetchMock).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledExactlyOnceWith('blob:test/1');
    stop();

    // The card comes back (a search cleared): the bytes were not kept, the HTTP cache has them.
    const again = showGalleryPreview(entry('neon'), vi.fn());
    await net.answer();
    expect(net.fetchMock).toHaveBeenCalledTimes(2);
    again();
    expect(revoked).toEqual(created);
  });

  it('leaves no object URL behind when the list is scrolled through and closed', async () => {
    const ids = Array.from({ length: 24 }, (_, i) => `t${i}`);
    const net = gallery(Object.fromEntries(ids.map((id, i) => [galleryUrl(`templates/${id}/preview.jpg`), () => jpeg(i, 128, PREVIEW)])));
    const open = new Map<string, () => void>();
    // Cards scroll into view a few at a time; some are filtered out by a search before their preview arrives.
    for (const [i, id] of ids.entries()) {
      open.set(id, showGalleryPreview(entry(id), vi.fn()));
      if (i % 5 === 4) {
        open.get(ids[i - 2])?.();
        open.delete(ids[i - 2]);
      }
      if (i % 6 === 5) await net.answer();
    }
    await net.answer();
    expect(created.length).toBeGreaterThan(0);
    expect(revoked.length).toBeLessThan(created.length);
    // The dialog closes: every card lets go.
    for (const stop of open.values()) stop();
    expect([...revoked].sort()).toEqual([...created].sort());
  });
});
