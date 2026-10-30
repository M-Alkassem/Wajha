/**
 * Module worker behind encodePngAsync. Announces itself with "ready" as soon
 * as it has loaded (the main thread only transfers pixels after that), then
 * encodes each request and transfers the PNG bytes back.
 */
import { encodePngBuffer } from './png';
import type { PngWorkerRequest, PngWorkerResponse } from './worker';

/** The parts of DedicatedWorkerGlobalScope we use (the app compiles against the DOM lib, not "webworker"). */
interface WorkerScope {
  onmessage: ((ev: MessageEvent<PngWorkerRequest>) => void) | null;
  postMessage(message: PngWorkerResponse, transfer?: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = (ev) => {
  const req: Partial<PngWorkerRequest> | null = ev.data;
  // Without an id there is nobody to answer; the main thread never sends such messages.
  if (req === null || typeof req !== 'object' || typeof req.id !== 'number') return;
  const { id, rgba, width, height } = req;
  try {
    if (!(rgba instanceof Uint8ClampedArray) || typeof width !== 'number' || typeof height !== 'number') throw new TypeError('Malformed PNG request');
    const png = encodePngBuffer(rgba, width, height);
    scope.postMessage({ type: 'done', id, png }, [png.buffer]);
  } catch (err) {
    scope.postMessage({ type: 'error', id, error: err instanceof Error ? err.message : String(err) });
  }
};

scope.postMessage({ type: 'ready' });
