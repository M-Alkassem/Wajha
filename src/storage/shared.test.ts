import { describe, expect, it } from 'vitest';
import { MAX_NAME_CHARS, StorageError, assertProjectId, assertTemplateId, mapLimit, reason, serial, withSuffix } from './shared';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('serial', () => {
  it('runs tasks with the same key one after another, in call order', async () => {
    const log: string[] = [];
    const task = (name: string, ms: number) => async () => {
      log.push(`start ${name}`);
      await sleep(ms);
      log.push(`end ${name}`);
      return name;
    };
    const results = await Promise.all([serial('k', task('a', 20)), serial('k', task('b', 0)), serial('k', task('c', 5))]);
    expect(results).toEqual(['a', 'b', 'c']);
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
  });

  it('lets different keys run concurrently', async () => {
    const log: string[] = [];
    await Promise.all([
      serial('x', async () => {
        log.push('x start');
        await sleep(15);
        log.push('x end');
      }),
      serial('y', async () => {
        log.push('y start');
        log.push('y end');
      }),
    ]);
    expect(log.indexOf('y end')).toBeLessThan(log.indexOf('x end'));
  });

  it('keeps going after a failed task', async () => {
    const failed = serial('f', async () => {
      throw new Error('boom');
    });
    const next = serial('f', async () => 'ok');
    await expect(failed).rejects.toThrow('boom');
    expect(await next).toBe('ok');
  });
});

describe('mapLimit', () => {
  it('keeps results in input order with bounded concurrency', async () => {
    let active = 0;
    let peak = 0;
    const out = await mapLimit([5, 1, 4, 2, 3, 0, 6], 3, async (n) => {
      active++;
      peak = Math.max(peak, active);
      await sleep(n);
      active--;
      return n * 10;
    });
    expect(out).toEqual([50, 10, 40, 20, 30, 0, 60]);
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('handles empty input and limits above the item count', async () => {
    expect(await mapLimit([], 8, async () => 1)).toEqual([]);
    expect(await mapLimit([1, 2], 50, async (n) => n + 1)).toEqual([2, 3]);
    expect(await mapLimit([1, 2], 0, async (n) => n)).toEqual([1, 2]);
  });

  it('rejects when a call fails', async () => {
    await expect(mapLimit([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error('two');
      return n;
    })).rejects.toThrow('two');
  });
});

describe('helpers', () => {
  it('withSuffix keeps names within the limit by code points', () => {
    expect(withSuffix('Habit', ' (imported)')).toBe('Habit (imported)');
    const long = withSuffix('😀'.repeat(300), ' (imported)');
    expect(Array.from(long)).toHaveLength(MAX_NAME_CHARS);
    expect(long.endsWith(' (imported)')).toBe(true);
    expect(long.includes('�')).toBe(false);
  });

  it('StorageError carries a code and a cause', () => {
    const cause = new Error('inner');
    const e = new StorageError('corrupt', 'outer', { cause });
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('StorageError');
    expect(e.code).toBe('corrupt');
    expect(e.cause).toBe(cause);
    expect(reason(e)).toBe('outer');
    expect(reason('plain')).toBe('plain');
  });

  it('project and template ids follow the model rules', () => {
    expect(assertProjectId('abc_DEF-123')).toBe('abc_DEF-123');
    expect(() => assertProjectId('a/b')).toThrow(/project id/);
    expect(() => assertProjectId('x'.repeat(65))).toThrow(/project id/);
    expect(() => assertProjectId('has space')).toThrow(/project id/);
    expect(assertTemplateId('sunset-glow-2')).toBe('sunset-glow-2');
    for (const bad of ['Sunset', 'sunset_glow', '-x', 'x-', 'a--b', '', 'x'.repeat(65)]) {
      expect(() => assertTemplateId(bad)).toThrow(/template id/);
    }
  });
});
