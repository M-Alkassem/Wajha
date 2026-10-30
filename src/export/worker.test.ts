import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodePng } from './png';
import type { PngWorkerRequest, PngWorkerResponse } from './worker';

type Behaviour = 'ok' | 'start-error' | 'silent' | 'throw' | 'error-response' | 'manual';

/**
 * Stand-in for the browser Worker. structuredClone with a transfer list
 * detaches the sender's buffer exactly like postMessage does.
 */
class FakeWorker {
  static behaviour: Behaviour = 'ok';
  static instances: FakeWorker[] = [];
  readonly url: URL;
  readonly options: WorkerOptions | undefined;
  onmessage: ((ev: { data: PngWorkerResponse | null }) => void) | null = null;
  onerror: ((ev: { message: string; preventDefault(): void }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminated = false;
  received: PngWorkerRequest[] = [];
  transfers: Transferable[][] = [];

  constructor(url: URL, options?: WorkerOptions) {
    if (FakeWorker.behaviour === 'throw') throw new Error('SecurityError: blocked by CSP');
    this.url = url;
    this.options = options;
    FakeWorker.instances.push(this);
    const behaviour = FakeWorker.behaviour;
    queueMicrotask(() => {
      if (this.terminated) return;
      if (behaviour === 'start-error') this.fail('Failed to load module script');
      else if (behaviour !== 'silent') this.emit({ type: 'ready' });
    });
  }

  postMessage(message: PngWorkerRequest, transfer: Transferable[] = []): void {
    const copy = structuredClone(message, { transfer });
    this.received.push(copy);
    this.transfers.push(transfer);
    if (FakeWorker.behaviour === 'manual') return;
    queueMicrotask(() => this.answer(copy));
  }

  answer(req: PngWorkerRequest): void {
    if (this.terminated) return;
    if (FakeWorker.behaviour === 'error-response') {
      this.emit({ type: 'error', id: req.id, error: 'out of memory' });
      return;
    }
    this.emit({ type: 'done', id: req.id, png: encodePng(req.rgba, req.width, req.height) });
  }

  emit(data: PngWorkerResponse | null): void {
    if (!this.terminated) this.onmessage?.({ data });
  }

  fail(message: string): void {
    if (!this.terminated) this.onerror?.({ message, preventDefault() {} });
  }

  terminate(): void {
    this.terminated = true;
  }
}

const pixels = (w: number, h: number, seed = 1) => {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < out.length; i++) out[i] = (i * 7 + seed * 13) & 255;
  return out;
};

async function freshModule() {
  vi.resetModules();
  return import('./worker');
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

beforeEach(() => {
  FakeWorker.behaviour = 'ok';
  FakeWorker.instances = [];
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('encodePngAsync without workers', () => {
  it('encodes on the main thread when Worker does not exist', async () => {
    vi.stubGlobal('Worker', undefined);
    const { encodePngAsync } = await freshModule();
    const rgba = pixels(9, 5);
    const expected = encodePng(rgba, 9, 5);
    expect(await encodePngAsync(rgba, 9, 5)).toEqual(expected);
    // Nothing was transferred, the caller still owns the pixels.
    expect(rgba.byteLength).toBe(9 * 5 * 4);
  });
});

describe('encodePngAsync with a worker', () => {
  beforeEach(() => vi.stubGlobal('Worker', FakeWorker));

  it('starts one module worker from png.worker.ts and transfers the pixels', async () => {
    const { encodePngAsync } = await freshModule();
    const rgba = pixels(8, 6);
    const expected = encodePng(rgba, 8, 6);
    const png = await encodePngAsync(rgba, 8, 6);
    expect(png).toEqual(expected);
    expect(FakeWorker.instances).toHaveLength(1);
    const w = FakeWorker.instances[0];
    expect(w.url.href).toMatch(/\/png\.worker\.ts$/);
    expect(w.options).toEqual({ type: 'module' });
    expect(w.transfers[0]).toHaveLength(1);
    // Transferred, not copied: the caller's view is detached.
    expect(rgba.byteLength).toBe(0);
  });

  it('shares the worker and matches concurrent answers by request id', async () => {
    FakeWorker.behaviour = 'manual';
    const { encodePngAsync } = await freshModule();
    const inputs = [pixels(3, 3, 1), pixels(4, 2, 2), pixels(5, 1, 3)];
    const expected = inputs.map((p, i) => encodePng(p, [3, 4, 5][i], [3, 2, 1][i]));
    const results = inputs.map((p, i) => encodePngAsync(p, [3, 4, 5][i], [3, 2, 1][i]));
    await flush();
    const w = FakeWorker.instances[0];
    expect(FakeWorker.instances).toHaveLength(1);
    expect(w.received).toHaveLength(3);
    const ids = w.received.map((r) => r.id);
    expect(new Set(ids).size).toBe(3);
    // Answer out of order.
    w.answer(w.received[2]);
    w.answer(w.received[0]);
    w.answer(w.received[1]);
    expect(await Promise.all(results)).toEqual(expected);
  });

  it('falls back to the main thread when the worker fails to start, without losing the pixels', async () => {
    FakeWorker.behaviour = 'start-error';
    const { encodePngAsync } = await freshModule();
    const rgba = pixels(6, 4);
    const expected = encodePng(rgba, 6, 4);
    expect(await encodePngAsync(rgba, 6, 4)).toEqual(expected);
    expect(FakeWorker.instances[0].terminated).toBe(true);
    expect(FakeWorker.instances[0].received).toHaveLength(0);
    // Workers stay off for the rest of the session.
    expect(await encodePngAsync(pixels(2, 2), 2, 2)).toEqual(encodePng(pixels(2, 2), 2, 2));
    expect(FakeWorker.instances).toHaveLength(1);
  });

  it('falls back when the Worker constructor throws (CSP, unsupported module workers)', async () => {
    FakeWorker.behaviour = 'throw';
    const { encodePngAsync } = await freshModule();
    const rgba = pixels(3, 3);
    expect(await encodePngAsync(rgba, 3, 3)).toEqual(encodePng(pixels(3, 3), 3, 3));
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it('gives up on a worker that never reports ready', async () => {
    vi.useFakeTimers();
    FakeWorker.behaviour = 'silent';
    const { encodePngAsync, WORKER_READY_TIMEOUT_MS } = await freshModule();
    const rgba = pixels(4, 4);
    const result = encodePngAsync(rgba, 4, 4);
    await vi.advanceTimersByTimeAsync(WORKER_READY_TIMEOUT_MS);
    expect(await result).toEqual(encodePng(pixels(4, 4), 4, 4));
    expect(FakeWorker.instances[0].terminated).toBe(true);
  });

  it('rejects with the worker error message and keeps the worker for later calls', async () => {
    FakeWorker.behaviour = 'error-response';
    const { encodePngAsync } = await freshModule();
    await expect(encodePngAsync(pixels(2, 2), 2, 2)).rejects.toThrow('out of memory');
    FakeWorker.behaviour = 'ok';
    expect(await encodePngAsync(pixels(2, 2), 2, 2)).toEqual(encodePng(pixels(2, 2), 2, 2));
    expect(FakeWorker.instances).toHaveLength(1);
  });

  it('rejects pending requests when the worker crashes, then starts a new one', async () => {
    FakeWorker.behaviour = 'manual';
    const { encodePngAsync } = await freshModule();
    const a = encodePngAsync(pixels(2, 2), 2, 2);
    const b = encodePngAsync(pixels(3, 2), 3, 2);
    await flush();
    FakeWorker.instances[0].fail('worker died');
    await expect(a).rejects.toThrow(/crashed: worker died/);
    await expect(b).rejects.toThrow(/crashed/);
    expect(FakeWorker.instances[0].terminated).toBe(true);
    FakeWorker.behaviour = 'ok';
    expect(await encodePngAsync(pixels(2, 2), 2, 2)).toEqual(encodePng(pixels(2, 2), 2, 2));
    expect(FakeWorker.instances).toHaveLength(2);
  });

  it('ignores malformed messages and answers for unknown requests', async () => {
    FakeWorker.behaviour = 'manual';
    const { encodePngAsync } = await freshModule();
    const result = encodePngAsync(pixels(2, 2), 2, 2);
    await flush();
    const w = FakeWorker.instances[0];
    w.emit(null);
    w.emit({ type: 'done', id: 999, png: new Uint8Array([1]) });
    w.answer(w.received[0]);
    expect(await result).toEqual(encodePng(pixels(2, 2), 2, 2));
  });

  it('terminates an idle worker and starts a new one on demand', async () => {
    vi.useFakeTimers();
    const { encodePngAsync, WORKER_IDLE_MS } = await freshModule();
    await encodePngAsync(pixels(2, 2), 2, 2);
    const first = FakeWorker.instances[0];
    await vi.advanceTimersByTimeAsync(WORKER_IDLE_MS - 1);
    expect(first.terminated).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(first.terminated).toBe(true);
    await encodePngAsync(pixels(2, 2), 2, 2);
    expect(FakeWorker.instances).toHaveLength(2);
  });

  it('keeps a busy worker alive', async () => {
    vi.useFakeTimers();
    FakeWorker.behaviour = 'manual';
    const { encodePngAsync, WORKER_IDLE_MS } = await freshModule();
    const result = encodePngAsync(pixels(2, 2), 2, 2);
    await vi.advanceTimersByTimeAsync(WORKER_IDLE_MS * 3);
    const w = FakeWorker.instances[0];
    expect(w.terminated).toBe(false);
    w.answer(w.received[0]);
    await result;
  });

  it('disposePngWorker terminates the worker and rejects what is pending', async () => {
    FakeWorker.behaviour = 'manual';
    const { encodePngAsync, disposePngWorker } = await freshModule();
    const pending = encodePngAsync(pixels(2, 2), 2, 2);
    await flush();
    disposePngWorker();
    await expect(pending).rejects.toThrow(/disposed/);
    expect(FakeWorker.instances[0].terminated).toBe(true);
    FakeWorker.behaviour = 'ok';
    await encodePngAsync(pixels(2, 2), 2, 2);
    expect(FakeWorker.instances).toHaveLength(2);
    disposePngWorker();
    disposePngWorker();
  });

  it('encodes on the main thread when disposed while the worker is starting', async () => {
    FakeWorker.behaviour = 'silent';
    const { encodePngAsync, disposePngWorker } = await freshModule();
    const result = encodePngAsync(pixels(3, 1), 3, 1);
    disposePngWorker();
    expect(await result).toEqual(encodePng(pixels(3, 1), 3, 1));
  });

  it('rejects invalid input before starting a worker or detaching anything', async () => {
    const { encodePngAsync } = await freshModule();
    const rgba = pixels(2, 2);
    await expect(encodePngAsync(rgba, 3, 3)).rejects.toThrow(RangeError);
    await expect(encodePngAsync(rgba, 0, 1)).rejects.toThrow(RangeError);
    expect(rgba.byteLength).toBe(16);
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it('copies a view on a larger buffer instead of detaching the whole buffer', async () => {
    const { encodePngAsync } = await freshModule();
    const backing = new Uint8ClampedArray(4 + 2 * 2 * 4);
    backing.set(pixels(2, 2), 4);
    const view = backing.subarray(4);
    expect(await encodePngAsync(view, 2, 2)).toEqual(encodePng(pixels(2, 2), 2, 2));
    expect(backing.byteLength).toBe(20);
  });
});

describe('png.worker', () => {
  it('announces readiness, encodes requests and reports errors', async () => {
    const posted: { message: PngWorkerResponse; transfer?: Transferable[] }[] = [];
    const scope: { onmessage: ((ev: { data: PngWorkerRequest }) => void) | null; postMessage(m: PngWorkerResponse, t?: Transferable[]): void } = {
      onmessage: null,
      postMessage(message, transfer) {
        posted.push({ message, transfer });
      },
    };
    vi.stubGlobal('self', scope);
    vi.resetModules();
    await import('./png.worker');
    expect(posted[0].message).toEqual({ type: 'ready' });
    expect(scope.onmessage).toBeTypeOf('function');

    const rgba = pixels(5, 3);
    scope.onmessage?.({ data: { id: 7, rgba, width: 5, height: 3 } });
    const done = posted[1];
    expect(done.message).toMatchObject({ type: 'done', id: 7 });
    const png = done.message.type === 'done' ? done.message.png : new Uint8Array();
    expect(png).toEqual(encodePng(rgba, 5, 3));
    expect(done.transfer).toEqual([png.buffer]);

    scope.onmessage?.({ data: { id: 8, rgba, width: 4, height: 3 } });
    expect(posted[2].message).toMatchObject({ type: 'error', id: 8 });
    expect(posted[2].message.type === 'error' && posted[2].message.error).toMatch(/Expected 48 bytes/);

    // Malformed requests: answered when they carry an id, ignored otherwise, never thrown.
    scope.onmessage?.({ data: { id: 9, rgba: [1, 2, 3, 4], width: 1, height: 1 } as unknown as PngWorkerRequest });
    expect(posted[3].message).toEqual({ type: 'error', id: 9, error: 'Malformed PNG request' });
    scope.onmessage?.({ data: null as unknown as PngWorkerRequest });
    scope.onmessage?.({ data: { rgba } as unknown as PngWorkerRequest });
    expect(posted).toHaveLength(4);
  });
});
