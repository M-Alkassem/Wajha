const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/**
 * Random 12-character id. Uses crypto.getRandomValues, which (unlike
 * crypto.randomUUID) also works outside secure contexts.
 */
export function newId(prefix = ''): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let out = prefix;
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}
