/**
 * Copying and comparing plain JSON data (the whole model is JSON).
 *
 * Copies matter because the store keeps immer-frozen snapshots: an object
 * taken from one (or from the resolveLayout cache) must be copied before it
 * is placed into a draft and edited, or the edit throws in strict mode.
 * `structuredClone` is avoided on purpose: older WKWebView builds lack it.
 */

/** Deep copy of JSON-like data. Unsafe keys (`__proto__`, ...) are skipped. */
export function deepClone<T>(value: T): T {
  return cloneValue(value) as T;
}

function cloneValue(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) {
    const out: unknown[] = new Array(v.length);
    for (let i = 0; i < v.length; i++) out[i] = cloneValue(v[i]);
    return out;
  }
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(v)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    out[key] = cloneValue((v as Record<string, unknown>)[key]);
  }
  return out;
}

/**
 * Structural equality for JSON-like data. Keys whose value is `undefined`
 * count as absent, matching what JSON.stringify would write.
 */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') {
    // NaN never equals itself through ===; treat two NaNs as equal data.
    return typeof a === 'number' && typeof b === 'number' && Number.isNaN(a) && Number.isNaN(b);
  }
  const aArr = Array.isArray(a);
  if (aArr !== Array.isArray(b)) return false;
  if (aArr) {
    const x = a as unknown[];
    const y = b as unknown[];
    if (x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) if (!jsonEqual(x[i], y[i])) return false;
    return true;
  }
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  const xk = Object.keys(x).filter((k) => x[k] !== undefined);
  const yk = Object.keys(y).filter((k) => y[k] !== undefined);
  if (xk.length !== yk.length) return false;
  for (const k of xk) {
    if (!Object.prototype.hasOwnProperty.call(y, k) || !jsonEqual(x[k], y[k])) return false;
  }
  return true;
}
