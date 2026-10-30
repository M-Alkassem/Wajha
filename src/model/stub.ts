/** Placeholder thrown by functions that are declared but not implemented yet. */
export function notImplemented(name: string): never {
  throw new Error(`${name} is not implemented yet`);
}
