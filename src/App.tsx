/**
 * App root: settings and theme, platform details, routing between the home
 * screen and the editor, and the global toast and confirm hosts.
 */
import { lazy, Suspense, useEffect } from 'react';
import { Spinner, TooltipProvider } from './ui/kit';
import { HomeScreen } from './ui/home/HomeScreen';
import { ToastHost } from './ui/shell/ToastHost';
import { ConfirmHost } from './ui/shell/ConfirmHost';
import { startSessionManager } from './ui/shell/session';
import { maybeStartDemo } from './ui/shell/demo';
import { maybeRunSelfTest } from './ui/shell/selfTest';
import { getPlatform } from './platform';
import { useApp } from './store';

// The UI kit showcase (visual QA) loads only for "?kit", so it never weighs on the app bundle.
const Showcase = lazy(() => import('./ui/kit/Showcase'));
const showKit = typeof location !== 'undefined' && new URLSearchParams(location.search).has('kit');

// The editor is a chunk of its own so the home screen starts sooner; it is fetched once the app has settled.
const loadEditor = () => import('./ui/editor/EditorScreen');
const EditorScreen = lazy(() => loadEditor().then((m) => ({ default: m.EditorScreen })));
const EDITOR_PRELOAD_MS = 1000;

export default function App() {
  if (showKit) {
    return (
      <Suspense fallback={null}>
        <Showcase />
      </Suspense>
    );
  }
  return <Shell />;
}

function Shell() {
  const route = useApp((s) => s.route);

  useEffect(() => {
    void useApp.getState().loadSettings();
    startSessionManager();
    void markPlatform();
    void maybeStartDemo();
    void maybeRunSelfTest();
    const preload = setTimeout(() => void loadEditor().catch(() => undefined), EDITOR_PRELOAD_MS);
    return () => clearTimeout(preload);
  }, []);

  return (
    <TooltipProvider>
      <div className="h-full">
        {route.name === 'editor' ? (
          <Suspense fallback={<LoadingEditor />}>
            <EditorScreen key={route.projectId} />
          </Suspense>
        ) : (
          <HomeScreen />
        )}
      </div>
      <ToastHost />
      <ConfirmHost />
    </TooltipProvider>
  );
}

function LoadingEditor() {
  return (
    <div data-tauri-drag-region className="flex h-full items-center justify-center bg-app">
      <Spinner size={20} label="Opening project" />
    </div>
  );
}

/** Exposes the platform to CSS (data-platform / data-os) and reserves room for macOS window buttons. */
async function markPlatform(): Promise<void> {
  try {
    const info = await getPlatform().info();
    const root = document.documentElement;
    root.dataset.platform = info.kind;
    root.dataset.os = info.os;
    root.style.setProperty('--traffic-lights-w', info.kind === 'desktop' && info.os === 'macos' ? '84px' : '0px');
  } catch {
    document.documentElement.style.setProperty('--traffic-lights-w', '0px');
  }
}
