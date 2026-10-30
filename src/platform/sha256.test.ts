import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sha256, sha256Hex } from './sha256';

const ascii = (s: string) => new TextEncoder().encode(s);
const nodeHash = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

describe('sha256 (pure JS)', () => {
  it('matches the FIPS 180-4 / NIST test vectors', () => {
    expect(sha256(ascii(''))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256(ascii('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256(ascii('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
    expect(sha256(new Uint8Array(1_000_000).fill(0x61))).toBe('cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
  });

  it('matches node:crypto around every padding boundary', () => {
    for (const len of [1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129, 1000]) {
      const data = Uint8Array.from({ length: len }, (_, i) => (i * 131 + len) & 0xff);
      expect(sha256(data), `length ${len}`).toBe(nodeHash(data));
    }
  });

  it('hashes subarrays by their own bytes only', () => {
    const backing = Uint8Array.from({ length: 300 }, (_, i) => i & 0xff);
    const view = backing.subarray(17, 217);
    expect(sha256(view)).toBe(nodeHash(view));
  });

  it('handles all byte values', () => {
    const data = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(sha256(data)).toBe(nodeHash(data));
  });
});

describe('sha256Hex', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('agrees with the pure-JS version through WebCrypto', async () => {
    const data = ascii('Wajha واجهة');
    expect(await sha256Hex(data)).toBe(sha256(data));
    expect(await sha256Hex(data)).toBe(nodeHash(data));
  });

  it('falls back when crypto.subtle is missing (insecure origins)', async () => {
    vi.stubGlobal('crypto', {});
    expect(await sha256Hex(ascii('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('falls back when crypto.subtle rejects', async () => {
    vi.stubGlobal('crypto', { subtle: { digest: () => Promise.reject(new Error('NotSupportedError')) } });
    expect(await sha256Hex(ascii(''))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});
