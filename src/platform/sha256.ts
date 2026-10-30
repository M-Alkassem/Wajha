/**
 * SHA-256 (FIPS 180-4). Asset ids are content hashes, so every platform needs
 * one. `sha256Hex` prefers WebCrypto; the pure-JS `sha256` covers pages
 * without it (crypto.subtle only exists in secure contexts, so the browser
 * build served over plain http from a LAN address has none).
 */

const K = new Int32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const H0 = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

/** One 64-byte block at `off`. All arithmetic is int32, wrapped with `| 0`. */
function compress(H: Int32Array, W: Int32Array, d: Uint8Array, off: number): void {
  for (let t = 0; t < 16; t++, off += 4) {
    W[t] = (d[off] << 24) | (d[off + 1] << 16) | (d[off + 2] << 8) | d[off + 3];
  }
  for (let t = 16; t < 64; t++) {
    const x = W[t - 15];
    const y = W[t - 2];
    const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
    const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
    W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0;
  }
  let a = H[0], b = H[1], c = H[2], dd = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
  for (let t = 0; t < 64; t++) {
    const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
    const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[t] + W[t]) | 0;
    const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
    h = g;
    g = f;
    f = e;
    e = (dd + t1) | 0;
    dd = c;
    c = b;
    b = a;
    a = (t1 + t2) | 0;
  }
  H[0] = (H[0] + a) | 0;
  H[1] = (H[1] + b) | 0;
  H[2] = (H[2] + c) | 0;
  H[3] = (H[3] + dd) | 0;
  H[4] = (H[4] + e) | 0;
  H[5] = (H[5] + f) | 0;
  H[6] = (H[6] + g) | 0;
  H[7] = (H[7] + h) | 0;
}

function toHex(words: ArrayLike<number>): string {
  let out = '';
  for (let i = 0; i < words.length; i++) out += (words[i] >>> 0).toString(16).padStart(8, '0');
  return out;
}

/** Pure-JS SHA-256 of `data` as 64 lowercase hex characters. */
export function sha256(data: Uint8Array): string {
  const H = new Int32Array(H0);
  const W = new Int32Array(64);
  const len = data.length;
  const full = len - (len % 64);
  // Full blocks are hashed in place; only the padded tail is copied.
  for (let off = 0; off < full; off += 64) compress(H, W, data, off);
  const rest = len - full;
  const tail = new Uint8Array(rest < 56 ? 64 : 128);
  tail.set(data.subarray(full));
  tail[rest] = 0x80;
  // Message length in bits, 64-bit big-endian. len * 8 can pass 2^32, so split it.
  const end = tail.length;
  const hi = Math.floor(len / 0x20000000);
  const lo = (len * 8) >>> 0;
  tail[end - 8] = hi >>> 24;
  tail[end - 7] = hi >>> 16;
  tail[end - 6] = hi >>> 8;
  tail[end - 5] = hi;
  tail[end - 4] = lo >>> 24;
  tail[end - 3] = lo >>> 16;
  tail[end - 2] = lo >>> 8;
  tail[end - 1] = lo;
  for (let off = 0; off < end; off += 64) compress(H, W, tail, off);
  return toHex(H);
}

/** SHA-256 as lowercase hex, through crypto.subtle when the page has it. */
export async function sha256Hex(data: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    try {
      const view = data.buffer instanceof ArrayBuffer ? (data as Uint8Array<ArrayBuffer>) : data.slice();
      const digest = new DataView(await subtle.digest('SHA-256', view));
      const words: number[] = [];
      for (let i = 0; i < 32; i += 4) words.push(digest.getUint32(i));
      return toHex(words);
    } catch {
      // Some engines refuse particular buffers (or the algorithm); the fallback is exact.
    }
  }
  return sha256(data);
}
