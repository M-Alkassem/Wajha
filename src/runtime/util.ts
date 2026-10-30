/** Small async helpers shared by the runtime services. */

export const noop = (): void => {};

/**
 * Resolves with the promise's value, or with undefined once `ms` elapsed or
 * the promise rejected. Never rejects, and clears its timer as soon as the
 * promise settles so idle pages keep no pending timers.
 */
export function settleWithin<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise<T | undefined>((resolve) => {
    const timer = setTimeout(() => resolve(undefined), Number.isFinite(ms) ? Math.max(0, ms) : 0);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(undefined);
      },
    );
  });
}

/** Human-readable message for anything thrown. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return String(err);
  } catch {
    return 'Unknown error';
  }
}
