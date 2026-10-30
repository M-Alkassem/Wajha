/**
 * encodePngAsync: runs encodePng in one shared module Web Worker so a
 * 1320 x 2868 export never freezes the editor, and falls back to the main
 * thread wherever workers are unavailable (no Worker global, a CSP that
 * blocks it, an old WebKit without module workers).
 *
 * Pixels are only posted once the worker has said it is ready. Posting
 * transfers (detaches) the buffer, so a worker that dies while loading would
 * otherwise take the only copy of the pixels with it.
 */
import { assertPngInput, encodePng } from './png';

/** Main thread -> worker. */
export interface PngWorkerRequest {
  id: number;
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Worker -> main thread. */
export type PngWorkerResponse =
  | { type: 'ready' }
  | { type: 'done'; id: number; png: Uint8Array }
  | { type: 'error'; id: number; error: string };

/** How long a starting worker may stay silent before we give up on workers. */
export const WORKER_READY_TIMEOUT_MS = 10_000;
/** An idle worker is terminated after this long, so it holds no memory between exports. */
export const WORKER_IDLE_MS = 30_000;
/** Crashes after a successful start we tolerate before staying on the main thread for good. */
const MAX_CRASHES = 3;

interface Pending {
  resolve(png: Uint8Array): void;
  reject(err: Error): void;
}

interface Session {
  worker: Worker;
  ready: Promise<boolean>;
  settleReady(ok: boolean): void;
  started: boolean;
}

let session: Session | null = null;
/** Set when a worker failed to start: every later call encodes on the main thread. */
let unavailable = false;
let crashes = 0;
let nextId = 1;
const pending = new Map<number, Pending>();
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function clearIdle(): void {
  if (idleTimer !== null) clearTimeout(idleTimer);
  idleTimer = null;
}

function scheduleIdle(): void {
  clearIdle();
  if (pending.size > 0 || session === null) return;
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (pending.size === 0) disposePngWorker();
  }, WORKER_IDLE_MS);
}

function rejectAll(err: Error): void {
  const all = [...pending.values()];
  pending.clear();
  for (const p of all) p.reject(err);
}

/** Terminates the worker of `s` (if it is still the current one) without touching `unavailable`. */
function endSession(s: Session): void {
  if (session !== s) return;
  session = null;
  clearIdle();
  s.settleReady(false);
  s.worker.terminate();
}

function onResponse(msg: PngWorkerResponse): void {
  if (msg.type === 'ready') return;
  const p = pending.get(msg.id);
  if (!p) return;
  pending.delete(msg.id);
  if (msg.type === 'done') p.resolve(msg.png);
  else p.reject(new Error(msg.error));
  scheduleIdle();
}

function startSession(): Session | null {
  if (unavailable || typeof Worker === 'undefined') return null;
  let worker: Worker;
  try {
    worker = new Worker(new URL('./png.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    unavailable = true;
    return null;
  }
  let settle: (ok: boolean) => void = () => {};
  const ready = new Promise<boolean>((resolve) => {
    settle = resolve;
  });
  const s: Session = { worker, ready, settleReady: (ok) => settle(ok), started: false };
  const timer = setTimeout(() => startFailed(), WORKER_READY_TIMEOUT_MS);
  const startFailed = () => {
    clearTimeout(timer);
    if (s.started || session !== s) return;
    unavailable = true;
    endSession(s);
  };
  worker.onmessage = (ev: MessageEvent<PngWorkerResponse | null>) => {
    const msg = ev.data;
    if (session !== s || msg === null || typeof msg !== 'object') return;
    if (msg.type === 'ready' && !s.started) {
      s.started = true;
      clearTimeout(timer);
      s.settleReady(true);
    }
    onResponse(msg);
  };
  worker.onerror = (ev: ErrorEvent) => {
    ev.preventDefault();
    if (session !== s) return;
    if (!s.started) return startFailed();
    // The transferred pixels of every pending request died with the worker.
    crashes++;
    if (crashes >= MAX_CRASHES) unavailable = true;
    endSession(s);
    rejectAll(new Error(`PNG worker crashed${ev.message ? `: ${ev.message}` : ''}`));
  };
  worker.onmessageerror = () => {
    if (session !== s) return;
    endSession(s);
    rejectAll(new Error('PNG worker sent a message that could not be read'));
  };
  session = s;
  return s;
}

/** A buffer we may transfer: the caller's own when the view spans all of it, else a private copy. */
function transferable(rgba: Uint8ClampedArray): Uint8ClampedArray<ArrayBuffer> {
  const buf = rgba.buffer;
  if (buf instanceof ArrayBuffer && rgba.byteOffset === 0 && rgba.byteLength === buf.byteLength) {
    return new Uint8ClampedArray(buf);
  }
  return new Uint8ClampedArray(rgba);
}

/**
 * encodePng off the main thread. The pixel buffer is transferred to the
 * worker, so `rgba` is unusable (detached) once this has been called; views
 * on a larger or shared buffer are copied first instead. Encoding errors
 * reject; a worker that cannot start or crashes is replaced by main-thread
 * encoding for the calls that still have their pixels.
 */
export async function encodePngAsync(rgba: Uint8ClampedArray, width: number, height: number): Promise<Uint8Array> {
  // Validate here so bad input fails in the caller's stack, before any transfer.
  assertPngInput(rgba, width, height);
  const s = session ?? startSession();
  if (!s || !(await s.ready) || session !== s) return encodePng(rgba, width, height);

  return new Promise<Uint8Array>((resolve, reject) => {
    const id = nextId++;
    const data = transferable(rgba);
    const request: PngWorkerRequest = { id, rgba: data, width, height };
    clearIdle();
    pending.set(id, { resolve, reject });
    try {
      s.worker.postMessage(request, [data.buffer]);
    } catch {
      // Serialisation failed before anything was transferred: the pixels are still ours.
      pending.delete(id);
      try {
        resolve(encodePng(rgba, width, height));
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
      scheduleIdle();
    }
  });
}

/**
 * Terminates the shared worker now (pending encodes reject). The next
 * encodePngAsync call starts a fresh one. Safe to call at any time.
 */
export function disposePngWorker(): void {
  const s = session;
  if (s) endSession(s);
  clearIdle();
  rejectAll(new Error('PNG worker was disposed'));
}
