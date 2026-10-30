/**
 * One animation-frame loop for the stage: drag updates and canvas repaints
 * are keyed tasks, so several requests for the same thing in one frame run
 * once, and every task requested while the loop runs (a drag step asking
 * its slide to repaint) still runs in the same frame.
 *
 * Repaints are budgeted: when a zoom asks ten slides to repaint at once,
 * the loop stops after `budgetMs` and continues next frame, so the stage
 * keeps answering the pointer (slides show their stretched bitmap for a
 * frame or two). Urgent tasks (the drag step) always run.
 */

export type FrameTask = () => void;

export interface FrameScheduler {
  /** Runs `task` in the next frame; a pending task with the same key is replaced. */
  schedule(key: string, task: FrameTask, urgent?: boolean): void;
  cancel(key: string): void;
  /** Runs everything pending now (tests, or before reading results synchronously). */
  flush(): void;
  pending(): number;
}

export interface FrameSchedulerOptions {
  requestFrame?: (cb: () => void) => unknown;
  now?: () => number;
  /** Time after which non-urgent tasks wait for the next frame. */
  budgetMs?: number;
  onError?: (error: unknown) => void;
}

interface Entry {
  task: FrameTask;
  urgent: boolean;
}

export function createFrameScheduler(options: FrameSchedulerOptions = {}): FrameScheduler {
  const requestFrame =
    options.requestFrame ??
    ((cb: () => void) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => cb()) : setTimeout(cb, 16)));
  const now = options.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  const budget = options.budgetMs ?? 10;
  const onError = options.onError ?? ((e: unknown) => console.error('[stage] frame task failed', e));
  const queue = new Map<string, Entry>();
  let requested = false;
  let running = false;

  const ensure = () => {
    if (requested || running) return;
    requested = true;
    requestFrame(() => {
      requested = false;
      run(true);
    });
  };

  const take = (urgentOnly: boolean): [string, Entry] | null => {
    for (const item of queue) {
      if (!urgentOnly || item[1].urgent) return item;
    }
    return null;
  };

  const run = (budgeted: boolean) => {
    if (running) return;
    running = true;
    const start = now();
    // Guard against tasks that keep re-queueing themselves.
    let steps = 0;
    try {
      while (queue.size && steps < 1000) {
        const overBudget = budgeted && steps > 0 && now() - start > budget;
        // Urgent tasks first, then the rest while the frame has time.
        const next = take(true) ?? (overBudget ? null : take(false));
        if (!next) break;
        const [key, entry] = next;
        queue.delete(key);
        steps++;
        try {
          entry.task();
        } catch (e) {
          onError(e);
        }
      }
    } finally {
      running = false;
    }
    if (queue.size) ensure();
  };

  return {
    schedule(key, task, urgent = false) {
      queue.delete(key);
      queue.set(key, { task, urgent });
      ensure();
    },
    cancel(key) {
      queue.delete(key);
    },
    flush() {
      run(false);
    },
    pending() {
      return queue.size;
    },
  };
}

/** The stage's shared loop. */
export const frames: FrameScheduler = createFrameScheduler();
