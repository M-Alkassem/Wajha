/**
 * App-wide state: routing between home and editor, settings (with the
 * light/dark theme applied to <html data-theme>), toasts and the confirm
 * dialog. The UI renders toasts and the dialog from this store and never
 * calls window.confirm. The toast list lives here; the kit Toaster that
 * shows it runs the auto-dismiss timers, so they pause while a toast is
 * hovered or focused.
 *
 * Every DOM access is guarded so the store also runs in Node tests.
 */
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { newId } from '../model/ids';
import { LIMITS, cleanName, cleanText } from '../model/rules';
import type { AppSettings } from '../model/types';
import { loadSettings as readSettings, saveSettings as writeSettings } from '../storage';

export type Route = { name: 'home' } | { name: 'editor'; projectId: string };

export type ToastKind = 'info' | 'success' | 'error' | 'warning';

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface ToastInput {
  kind: ToastKind;
  title: string;
  description?: string;
  action?: ToastAction;
  /**
   * Auto-dismiss delay in ms; 0 or Infinity keeps the toast until dismissed.
   * Defaults per kind (the kit's DEFAULT_TOAST_DURATION: errors stay longest).
   */
  duration?: number;
}

export interface Toast extends ToastInput {
  id: string;
  createdAt: number;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive action: the UI styles the confirm button as danger. */
  danger?: boolean;
}

export interface ConfirmRequest extends ConfirmOptions {
  id: string;
}

export type ResolvedTheme = 'dark' | 'light';

/** Older toasts are dropped beyond this many. */
export const MAX_TOASTS = 5;
export const DEFAULT_APP_SETTINGS: Readonly<AppSettings> = Object.freeze({ theme: 'system', hints: true });

export interface AppState {
  route: Route;
  settings: AppSettings;
  /** True once settings were read from disk (or defaults were used after a failure). */
  settingsLoaded: boolean;
  /** The theme actually shown: 'system' resolved through prefers-color-scheme. */
  resolvedTheme: ResolvedTheme;
  toasts: Toast[];
  /** The confirm dialog to show, or null. Further requests queue behind it. */
  confirmRequest: ConfirmRequest | null;

  navigate(route: Route): void;
  /** Reads settings.json and applies the theme. Never rejects. */
  loadSettings(): Promise<AppSettings>;
  /** Applies and persists a settings change; a failed save shows an error toast. */
  updateSettings(patch: Partial<AppSettings>): Promise<void>;

  /** Shows a toast; returns its id. */
  pushToast(input: ToastInput): string;
  dismissToast(id: string): void;
  /** Runs the toast's action and dismisses it. */
  runToastAction(id: string): void;
  clearToasts(): void;

  /** Asks the user; resolves true when they confirm, false when they cancel. */
  confirm(options: ConfirmOptions): Promise<boolean>;
  /** Called by the dialog with the user's answer. */
  resolveConfirm(result: boolean): void;
}

/* Theme ------------------------------------------------------------- */

const DARK_QUERY = '(prefers-color-scheme: dark)';

function mediaQuery(): MediaQueryList | null {
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
    return window.matchMedia(DARK_QUERY);
  } catch {
    return null;
  }
}

function setDocumentTheme(theme: ResolvedTheme): void {
  try {
    if (typeof document === 'undefined' || !document.documentElement) return;
    document.documentElement.dataset.theme = theme;
  } catch {
    // A locked-down document is not a reason to fail the app.
  }
}

function resolveTheme(setting: AppSettings['theme']): ResolvedTheme {
  if (setting === 'dark' || setting === 'light') return setting;
  const mq = mediaQuery();
  // Dark is the app's default look when the system preference is unknown.
  return mq ? (mq.matches ? 'dark' : 'light') : 'dark';
}

function normalizeSettings(s: unknown): AppSettings {
  const out: AppSettings = { ...DEFAULT_APP_SETTINGS };
  if (typeof s !== 'object' || s === null) return out;
  const o = s as Record<string, unknown>;
  if (o.theme === 'system' || o.theme === 'dark' || o.theme === 'light') out.theme = o.theme;
  if (typeof o.hints === 'boolean') out.hints = o.hints;
  return out;
}

/** Creates an isolated app store (the app uses the `useApp` singleton; tests make their own). */
export function createAppStore() {
  // Counts user changes, so a slow settings read never overwrites a newer choice.
  let revision = 0;
  const confirmQueue: { request: ConfirmRequest; resolve: (ok: boolean) => void }[] = [];
  let unwatchSystem: (() => void) | null = null;

  return create<AppState>()(
    immer((set, get) => {
      /** Applies a theme setting and follows the OS live while it is 'system'. */
      const applyTheme = (setting: AppSettings['theme']) => {
        unwatchSystem?.();
        unwatchSystem = null;
        if (setting === 'system') {
          const mq = mediaQuery();
          if (mq) {
            const onChange = () => {
              const t: ResolvedTheme = mq.matches ? 'dark' : 'light';
              setDocumentTheme(t);
              set({ resolvedTheme: t });
            };
            if (typeof mq.addEventListener === 'function') {
              mq.addEventListener('change', onChange);
              unwatchSystem = () => mq.removeEventListener('change', onChange);
            } else if (typeof mq.addListener === 'function') {
              // Safari before 14 only has the legacy listener API.
              mq.addListener(onChange);
              unwatchSystem = () => mq.removeListener(onChange);
            }
          }
        }
        const resolved = resolveTheme(setting);
        setDocumentTheme(resolved);
        set({ resolvedTheme: resolved });
      };

      return {
        route: { name: 'home' },
        settings: { ...DEFAULT_APP_SETTINGS },
        settingsLoaded: false,
        resolvedTheme: resolveTheme(DEFAULT_APP_SETTINGS.theme),
        toasts: [],
        confirmRequest: null,

        navigate(route) {
          if (route.name === 'editor' && (typeof route.projectId !== 'string' || route.projectId === '')) return;
          set({ route: route.name === 'home' ? { name: 'home' } : { name: 'editor', projectId: route.projectId } });
        },

        async loadSettings() {
          const at = revision;
          let settings: AppSettings;
          try {
            settings = normalizeSettings(await readSettings());
          } catch {
            settings = { ...DEFAULT_APP_SETTINGS };
          }
          if (at !== revision) {
            // The user changed something while the file was being read: theirs wins.
            set({ settingsLoaded: true });
            return get().settings;
          }
          set({ settings, settingsLoaded: true });
          applyTheme(settings.theme);
          return settings;
        },

        async updateSettings(patch) {
          const settings = normalizeSettings({ ...get().settings, ...patch });
          const before = get().settings;
          if (settings.theme === before.theme && settings.hints === before.hints) return;
          revision++;
          set({ settings });
          if (settings.theme !== before.theme) applyTheme(settings.theme);
          try {
            await writeSettings(settings);
          } catch (e) {
            get().pushToast({
              kind: 'error',
              title: 'Settings were not saved',
              description: e instanceof Error ? e.message : String(e),
            });
          }
        },

        pushToast(input) {
          const id = newId('t');
          const toast: Toast = {
            id,
            createdAt: Date.now(),
            kind: input.kind === 'success' || input.kind === 'error' || input.kind === 'warning' ? input.kind : 'info',
            title: cleanName(String(input.title ?? ''), LIMITS.name),
          };
          if (input.description) toast.description = cleanText(String(input.description), 500);
          const label = input.action && typeof input.action.run === 'function' ? cleanName(String(input.action.label ?? ''), 40) : '';
          if (input.action && label) toast.action = { label, run: input.action.run };
          if (input.duration !== undefined) toast.duration = input.duration;
          // The oldest go first when too many pile up.
          set({ toasts: [...get().toasts, toast].slice(-MAX_TOASTS) });
          return id;
        },

        dismissToast(id) {
          if (!get().toasts.some((t) => t.id === id)) return;
          set((s) => {
            s.toasts = s.toasts.filter((t) => t.id !== id);
          });
        },

        runToastAction(id) {
          const toast = get().toasts.find((t) => t.id === id);
          get().dismissToast(id);
          // Dismiss first: an action that throws must not leave a stuck toast.
          toast?.action?.run();
        },

        clearToasts() {
          if (get().toasts.length) set({ toasts: [] });
        },

        confirm(options) {
          return new Promise<boolean>((resolve) => {
            const request: ConfirmRequest = {
              id: newId('c'),
              title: cleanName(String(options?.title ?? ''), LIMITS.name),
              message: cleanText(String(options?.message ?? ''), LIMITS.text),
            };
            if (options?.confirmLabel) request.confirmLabel = cleanName(String(options.confirmLabel), 40);
            if (options?.cancelLabel) request.cancelLabel = cleanName(String(options.cancelLabel), 40);
            if (options?.danger) request.danger = true;
            confirmQueue.push({ request, resolve });
            if (!get().confirmRequest) set({ confirmRequest: request });
          });
        },

        resolveConfirm(result) {
          const head = confirmQueue.shift();
          set({ confirmRequest: confirmQueue.length ? confirmQueue[0].request : null });
          head?.resolve(result === true);
        },
      };
    }),
  );
}

export type AppStore = ReturnType<typeof createAppStore>;

export const useApp: AppStore = createAppStore();

/** Toast shortcuts for code outside React components. */
export const toast = {
  push: (input: ToastInput) => useApp.getState().pushToast(input),
  dismiss: (id: string) => useApp.getState().dismissToast(id),
  info: (title: string, description?: string) => useApp.getState().pushToast({ kind: 'info', title, description }),
  success: (title: string, description?: string) => useApp.getState().pushToast({ kind: 'success', title, description }),
  warning: (title: string, description?: string) => useApp.getState().pushToast({ kind: 'warning', title, description }),
  error: (title: string, description?: string) => useApp.getState().pushToast({ kind: 'error', title, description }),
};

/** Shorthand for `useApp.getState().confirm(options)`. */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return useApp.getState().confirm(options);
}
