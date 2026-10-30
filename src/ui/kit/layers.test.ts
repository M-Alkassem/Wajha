import { afterEach, describe, expect, it, vi } from 'vitest';
import { isToastTarget, modalOpen, registerModal, TOAST_REGION_ATTR } from './layers';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('registerModal', () => {
  it('counts open dialogs, nested ones included, and ignores a second close', () => {
    expect(modalOpen()).toBe(false);
    const closeOuter = registerModal();
    const closeInner = registerModal();
    expect(modalOpen()).toBe(true);
    closeInner();
    closeInner();
    expect(modalOpen()).toBe(true);
    closeOuter();
    expect(modalOpen()).toBe(false);
  });
});

describe('isToastTarget', () => {
  /** Elements that are, or are not, inside the toast region. */
  class FakeElement {
    readonly inToasts: boolean;
    constructor(inToasts: boolean) {
      this.inToasts = inToasts;
    }
    closest(selector: string) {
      return this.inToasts && selector === `[${TOAST_REGION_ATTR}]` ? this : null;
    }
  }

  it('recognises targets inside the toast region', () => {
    vi.stubGlobal('Element', FakeElement);
    expect(isToastTarget(new FakeElement(true) as unknown as Element)).toBe(true);
    expect(isToastTarget(new FakeElement(false) as unknown as Element)).toBe(false);
    expect(isToastTarget(null)).toBe(false);
  });

  it('is false without a DOM', () => {
    expect(isToastTarget({} as EventTarget)).toBe(false);
  });
});
