import { describe, expect, it } from 'vitest';
import { createFrameScheduler } from './frameScheduler';

function manual(budgetMs = 10) {
  const frames: (() => void)[] = [];
  let clock = 0;
  const errors: unknown[] = [];
  const s = createFrameScheduler({
    requestFrame: (cb) => frames.push(cb),
    now: () => clock,
    budgetMs,
    onError: (e) => errors.push(e),
  });
  const tick = () => {
    const batch = frames.splice(0);
    for (const f of batch) f();
  };
  return { s, frames, tick, errors, advance: (ms: number) => (clock += ms) };
}

describe('frame scheduler', () => {
  it('runs a task once per key per frame, latest wins', () => {
    const { s, tick, frames } = manual();
    const log: string[] = [];
    s.schedule('a', () => log.push('a1'));
    s.schedule('a', () => log.push('a2'));
    s.schedule('b', () => log.push('b'));
    expect(frames).toHaveLength(1);
    tick();
    // The replaced task keeps its place in the queue order of the latest schedule call.
    expect(log).toEqual(['a2', 'b']);
    expect(s.pending()).toBe(0);
  });

  it('runs tasks scheduled by tasks in the same frame', () => {
    const { s, tick, frames } = manual();
    const log: string[] = [];
    s.schedule('drag', () => {
      log.push('drag');
      s.schedule('paint', () => log.push('paint'));
    });
    tick();
    expect(log).toEqual(['drag', 'paint']);
    expect(frames).toHaveLength(0);
  });

  it('defers non-urgent work past the budget to the next frame, never urgent work', () => {
    const t = manual(10);
    const log: string[] = [];
    t.s.schedule('p1', () => {
      log.push('p1');
      t.advance(12);
    });
    t.s.schedule('p2', () => log.push('p2'));
    t.s.schedule('drag', () => log.push('drag'), true);
    t.tick();
    // Urgent first, then p1 blows the budget and p2 waits.
    expect(log).toEqual(['drag', 'p1']);
    expect(t.frames).toHaveLength(1);
    t.tick();
    expect(log).toEqual(['drag', 'p1', 'p2']);
  });

  it('cancels and flushes', () => {
    const { s } = manual();
    const log: string[] = [];
    s.schedule('a', () => log.push('a'));
    s.schedule('b', () => log.push('b'));
    s.cancel('a');
    s.flush();
    expect(log).toEqual(['b']);
  });

  it('keeps going when a task throws', () => {
    const { s, tick, errors } = manual();
    const log: string[] = [];
    s.schedule('bad', () => {
      throw new Error('boom');
    });
    s.schedule('good', () => log.push('good'));
    tick();
    expect(errors).toHaveLength(1);
    expect(log).toEqual(['good']);
  });
});
