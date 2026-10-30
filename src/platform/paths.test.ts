import { describe, expect, it } from 'vitest';
import {
  MAX_PATH_BYTES,
  MAX_SEGMENT_BYTES,
  checkAssetInput,
  directChildren,
  exactBytes,
  isAssetId,
  isHttpsUrl,
  isImageExt,
  isValidPathSegment,
  pathProblem,
  sniffImageExt,
  utf8Length,
  validateLibraryPath,
  validatePathSegment,
} from './paths';
import { PlatformError } from './types';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xdb, 0, 0]);
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 9, 9, 9, 9, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50]);
const HEX = 'a'.repeat(64);

function codeOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof PlatformError ? e.code : 'not a PlatformError';
  }
}

describe('validateLibraryPath', () => {
  it.each([
    'settings.json',
    'projects/abc123/project.json',
    `projects/p/assets/${HEX}.png`,
    'cache/gallery-index.json',
    'App Store/en-US/iPhone 6.9/01.png',
    'App Store/ar-SA/صور/01.png',
    'emoji/😀.txt',
    '.hidden/file',
    'a..b/c...d',
    'trailing.dot.',
  ])('accepts %s', (path) => {
    expect(validateLibraryPath(path)).toBe(path);
    expect(pathProblem(path)).toBeNull();
  });

  it.each([
    ['', 'empty'],
    ['/etc/passwd', 'absolute'],
    ['projects/../secret', 'dot-dot segment'],
    ['..', 'dot-dot alone'],
    ['./projects', 'dot segment'],
    ['projects/.', 'trailing dot segment'],
    ['projects\\x', 'backslash'],
    ['projects//x', 'empty segment'],
    ['projects/', 'trailing slash'],
    ['C:/Windows', 'drive letter'],
    ['a:b', 'colon'],
    ['nul\u0000byte', 'NUL'],
    ['tab\there', 'tab'],
    ['line\nbreak', 'newline'],
    ['del\u007f', 'DEL'],
    ['c1\u0085', 'C1 control'],
    ['lone\ud800', 'unpaired high surrogate'],
    ['lone\udc00x', 'unpaired low surrogate'],
  ])('rejects %j (%s)', (path) => {
    expect(codeOf(() => validateLibraryPath(path))).toBe('invalid_path');
  });

  it('rejects non-strings without throwing anything else', () => {
    expect(pathProblem(undefined)).toMatch(/not a string/);
    expect(pathProblem(42)).toMatch(/not a string/);
    expect(codeOf(() => validateLibraryPath(null as unknown as string))).toBe('invalid_path');
  });

  it('measures lengths in UTF-8 bytes, like Rust', () => {
    expect(validateLibraryPath('a'.repeat(MAX_SEGMENT_BYTES))).toBeTruthy();
    expect(codeOf(() => validateLibraryPath('a'.repeat(MAX_SEGMENT_BYTES + 1)))).toBe('invalid_path');
    // 128 Arabic letters are 256 bytes: one too many for a segment.
    expect(codeOf(() => validateLibraryPath('ب'.repeat(128)))).toBe('invalid_path');
    expect(validateLibraryPath('ب'.repeat(127))).toBeTruthy();
    const ok = Array.from({ length: 4 }, () => 'x'.repeat(127)).join('/'); // 4 * 127 + 3 = 511
    expect(utf8Length(ok)).toBe(511);
    expect(validateLibraryPath(`${ok}y`)).toBeTruthy(); // 512
    expect(codeOf(() => validateLibraryPath(`${ok}yz`))).toBe('invalid_path'); // 513
    expect(MAX_PATH_BYTES).toBe(512);
  });

  it('rejects huge inputs quickly and keeps the message short', () => {
    const huge = 'a/'.repeat(5_000_000);
    const started = performance.now();
    let message = '';
    try {
      validateLibraryPath(huge);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(performance.now() - started).toBeLessThan(50);
    expect(message.length).toBeLessThan(300);
  });
});

describe('utf8Length', () => {
  it('counts bytes per code point', () => {
    expect(utf8Length('')).toBe(0);
    expect(utf8Length('abc')).toBe(3);
    expect(utf8Length('é')).toBe(2);
    expect(utf8Length('ب')).toBe(2);
    expect(utf8Length('€')).toBe(3);
    expect(utf8Length('😀')).toBe(4);
    expect(utf8Length('a😀b')).toBe(6);
    expect(utf8Length('\ud800')).toBe(3);
    expect(utf8Length('x😀')).toBe(new TextEncoder().encode('x😀').length);
  });
});

describe('validatePathSegment', () => {
  it('accepts ids and rejects anything that is not one segment', () => {
    expect(validatePathSegment('abc123', 'project id')).toBe('abc123');
    expect(isValidPathSegment('sunset-glow')).toBe(true);
    for (const bad of ['', '.', '..', 'a/b', 'a\\b', 'a:b', 'a\u0000', '\ud83d']) {
      expect(isValidPathSegment(bad)).toBe(false);
      expect(codeOf(() => validatePathSegment(bad, 'project id'))).toBe('invalid_path');
    }
    expect(isValidPathSegment(42)).toBe(false);
  });

  it('names what was invalid', () => {
    expect(() => validatePathSegment('a/b', 'template id')).toThrow(/template id/);
  });
});

describe('directChildren', () => {
  it('lists direct files and infers directories from nested keys', () => {
    const keys = [
      'projects/a/project.json',
      'projects/a/assets/x.png',
      'projects/b/meta.json',
      'projects/readme.txt',
      'projectsX/no.json',
      'projects',
      'other/projects/a',
    ];
    const { files, dirs } = directChildren('projects', keys);
    expect(files).toEqual(['readme.txt']);
    expect(dirs.sort()).toEqual(['a', 'b']);
  });

  it('returns nothing for an unknown directory', () => {
    expect(directChildren('nope', ['a/b'])).toEqual({ files: [], dirs: [] });
  });
});

describe('image helpers', () => {
  it('sniffs PNG, JPEG and WebP signatures', () => {
    expect(sniffImageExt(PNG)).toBe('png');
    expect(sniffImageExt(JPEG)).toBe('jpg');
    expect(sniffImageExt(WEBP)).toBe('webp');
  });

  it('rejects other and truncated data', () => {
    expect(sniffImageExt(new Uint8Array())).toBeNull();
    expect(sniffImageExt(PNG.subarray(0, 7))).toBeNull();
    expect(sniffImageExt(JPEG.subarray(0, 2))).toBeNull();
    expect(sniffImageExt(WEBP.subarray(0, 11))).toBeNull();
    expect(sniffImageExt(new TextEncoder().encode('GIF89a......'))).toBeNull();
    // RIFF but not WebP (a WAV file)
    expect(sniffImageExt(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]))).toBeNull();
  });

  it('recognises asset ids and extensions', () => {
    expect(isAssetId(`${HEX}.png`)).toBe(true);
    expect(isAssetId(`${HEX}.jpg`)).toBe(true);
    expect(isAssetId(`${HEX}.webp`)).toBe(true);
    expect(isAssetId(`${HEX}.jpeg`)).toBe(false);
    expect(isAssetId(`${HEX.toUpperCase()}.png`)).toBe(false);
    expect(isAssetId(`${HEX.slice(1)}.png`)).toBe(false);
    expect(isAssetId(`../${HEX}.png`)).toBe(false);
    expect(isAssetId(`${HEX}.png\n`)).toBe(false);
    expect(isAssetId(null)).toBe(false);
    expect(isImageExt('png')).toBe(true);
    expect(isImageExt('gif')).toBe(false);
  });

  it('checkAssetInput enforces id, extension and a matching signature', () => {
    expect(() => checkAssetInput('p1', PNG, 'png')).not.toThrow();
    expect(codeOf(() => checkAssetInput('../p', PNG, 'png'))).toBe('invalid_path');
    expect(codeOf(() => checkAssetInput('p1', PNG, 'gif' as 'png'))).toBe('invalid_data');
    expect(codeOf(() => checkAssetInput('p1', JPEG, 'png'))).toBe('invalid_data');
    expect(codeOf(() => checkAssetInput('p1', new Uint8Array(4), 'png'))).toBe('invalid_data');
    expect(codeOf(() => checkAssetInput('p1', 'text' as unknown as Uint8Array, 'png'))).toBe('invalid_data');
  });
});

describe('isHttpsUrl', () => {
  it('only accepts absolute https URLs', () => {
    expect(isHttpsUrl('https://github.com/wajha')).toBe(true);
    expect(isHttpsUrl('HTTPS://EXAMPLE.COM')).toBe(true);
    for (const bad of ['http://example.com', 'javascript:alert(1)', 'file:///etc/passwd', 'mailto:a@b.c', '/relative', '', 'https://', 'notaurl']) {
      expect(isHttpsUrl(bad)).toBe(false);
    }
    expect(isHttpsUrl(`https://a.com/${'x'.repeat(9000)}`)).toBe(false);
    expect(isHttpsUrl(undefined)).toBe(false);
  });
});

describe('exactBytes', () => {
  it('keeps exact views and copies subarrays', () => {
    const whole = new Uint8Array([1, 2, 3, 4]);
    expect(exactBytes(whole)).toBe(whole);
    const sub = whole.subarray(1, 3);
    const copy = exactBytes(sub);
    expect(copy).not.toBe(sub);
    expect([...copy]).toEqual([2, 3]);
    expect(copy.buffer.byteLength).toBe(2);
  });
});
