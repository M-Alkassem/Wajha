import { useEffect, useState, type ReactNode } from 'react';
import { Check, Copy, ExternalLink, Monitor, Moon, Settings, Sun } from 'lucide-react';
import { APP_NAME_AR, REPO_URL } from '../../config';
import type { AppSettings } from '../../model/types';
import { getPlatform, type AppInfo } from '../../platform';
import { toast, useApp } from '../../store';
import { Logo } from '../brand/Logo';
import { Button, cx, Dialog, DialogContent, Switch } from '../kit';
import { useHomeUi } from './homeUi';
import { errorText } from './library';

type Theme = AppSettings['theme'];

const THEMES: ReadonlyArray<{ value: Theme; label: string; icon: ReactNode }> = [
  { value: 'system', label: 'System', icon: <Monitor /> },
  { value: 'dark', label: 'Dark', icon: <Moon /> },
  { value: 'light', label: 'Light', icon: <Sun /> },
];

const OS_LABEL: Record<AppInfo['os'], string> = { macos: 'macOS', windows: 'Windows', linux: 'Linux', web: 'Browser' };

/** App settings: appearance, editor hints, and about (version, data folder, links, licenses). */
export function SettingsDialog() {
  const open = useHomeUi((s) => s.settingsOpen);
  const setOpen = useHomeUi((s) => s.setSettingsOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        size="md"
        icon={<Settings />}
        title="Settings"
        description="Changes apply right away."
        footer={
          <Button variant="primary" onClick={() => setOpen(false)}>
            Done
          </Button>
        }
      >
        <SettingsBody />
      </DialogContent>
    </Dialog>
  );
}

function SettingsBody() {
  const theme = useApp((s) => s.settings.theme);
  const hints = useApp((s) => s.settings.hints);
  const update = useApp((s) => s.updateSettings);
  return (
    <div className="flex flex-col">
      <Group title="Appearance">
        <div
          role="radiogroup"
          aria-label="Theme"
          className="grid grid-cols-3 gap-3"
          onKeyDown={(e) => {
            // One tab stop; arrows move the choice like native radio buttons.
            const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
            if (!step) return;
            e.preventDefault();
            const at = THEMES.findIndex((t) => t.value === theme);
            const next = THEMES[(at + step + THEMES.length) % THEMES.length];
            void update({ theme: next.value });
            e.currentTarget.querySelector<HTMLElement>(`[data-theme-option="${next.value}"]`)?.focus();
          }}
        >
          {THEMES.map((t) => (
            <ThemeTile key={t.value} theme={t.value} label={t.label} icon={t.icon} selected={theme === t.value} onSelect={() => void update({ theme: t.value })} />
          ))}
        </div>
      </Group>
      <Group title="Editor">
        <label className="flex items-start gap-3">
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-ui text-text">Show hints</span>
            <span className="text-xs leading-4 text-text-3">Short tips for first steps in the editor, like dropping screenshots onto a slide.</span>
          </span>
          <Switch aria-label="Show hints" checked={hints} onCheckedChange={(v) => void update({ hints: v })} className="mt-0.5" />
        </label>
      </Group>
      <Group title="About" last>
        <About />
      </Group>
    </div>
  );
}

function Group({ title, children, last = false }: { title: string; children: ReactNode; last?: boolean }) {
  return (
    <section className={cx('flex flex-col gap-3 py-4', !last && 'border-b border-line')}>
      <h3 className="text-2xs font-medium tracking-[0.04em] text-text-3 uppercase">{title}</h3>
      {children}
    </section>
  );
}

/** A miniature window drawn with the theme's own tokens (data-theme scopes them). */
function MiniWindow({ theme }: { theme: 'dark' | 'light' }) {
  return (
    <div data-theme={theme} className="flex size-full flex-col bg-app">
      <div className="flex h-[18%] items-center gap-[3px] border-b border-line bg-panel px-[7%]">
        <span className="size-[5px] rounded-full bg-surface-3" />
        <span className="size-[5px] rounded-full bg-surface-3" />
        <span className="ml-auto h-[38%] w-[22%] rounded-[3px] bg-accent" />
      </div>
      <div className="grid flex-1 grid-cols-3 gap-[6%] p-[8%]">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-[10%] rounded-[3px] border border-line bg-surface p-[10%]">
            <div className="flex-1 rounded-[2px] bg-surface-3" />
            <div className="h-[10%] w-[70%] rounded-full bg-text-3" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ThemeTile({ theme, label, icon, selected, onSelect }: { theme: Theme; label: string; icon: ReactNode; selected: boolean; onSelect(): void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      tabIndex={selected ? 0 : -1}
      data-theme-option={theme}
      onClick={onSelect}
      className="group/theme flex flex-col gap-2 rounded-lg text-left outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <span
        className={cx(
          'relative block aspect-[16/10] w-full overflow-hidden rounded-md border transition-[border-color,box-shadow] duration-(--dur-fast) ease-out',
          selected ? 'border-transparent ring-2 ring-accent' : 'border-line-strong group-hover/theme:border-text-3',
        )}
      >
        {theme === 'system' ? (
          <>
            <span className="absolute inset-0">
              <MiniWindow theme="light" />
            </span>
            {/* The dark half, cut diagonally. */}
            <span className="absolute inset-0 [clip-path:polygon(62%_0,100%_0,100%_100%,38%_100%)]">
              <MiniWindow theme="dark" />
            </span>
          </>
        ) : (
          <MiniWindow theme={theme} />
        )}
      </span>
      <span className={cx('flex items-center gap-1.5 px-0.5 text-xs font-medium [&_svg]:size-3.5', selected ? 'text-text' : 'text-text-2')}>
        <span className={selected ? 'text-accent-fg' : 'text-text-3'}>{icon}</span>
        {label}
        {selected && <Check className="ml-auto text-accent-fg" strokeWidth={2.5} />}
      </span>
    </button>
  );
}

function About() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  useEffect(() => {
    let alive = true;
    getPlatform()
      .info()
      .then((i) => alive && setInfo(i))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const desktop = info?.kind === 'desktop';
  const open = (url: string) => {
    getPlatform()
      .openUrl(url)
      .catch((e: unknown) => toast.error('Could not open the link', errorText(e)));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3.5">
        <span className="relative flex size-12 shrink-0 items-center justify-center rounded-[13px] bg-[var(--brand-night)] shadow-md ring-1 ring-line">
          <span aria-hidden className="absolute inset-0 rounded-[inherit] opacity-40" style={{ background: 'radial-gradient(60% 55% at 50% 62%, var(--brand-pink), transparent)' }} />
          <Logo size={34} title={null} className="relative" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="flex items-baseline gap-2">
            <span className="font-brand text-[17px] leading-5 font-semibold tracking-[-0.03em] text-text">Wajha</span>
            <span lang="ar" dir="rtl" className="font-brand-ar text-xs text-text-3">
              {APP_NAME_AR}
            </span>
          </span>
          <span className="text-xs text-text-2 tabular-nums">
            {info ? `Version ${info.version} · ${OS_LABEL[info.os] ?? info.os}` : ' '}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-text-2">{desktop ? 'Data folder' : 'Storage'}</span>
        {desktop && info ? (
          <DataFolder path={info.dataDir} />
        ) : (
          <p className="text-xs leading-4 text-text-3">Projects are stored in this browser. Use “Export as file” on a project to keep a copy.</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" trailingIcon={<ExternalLink />} onClick={() => open(REPO_URL)}>
          Source code on GitHub
        </Button>
        <Button size="sm" variant="ghost" trailingIcon={<ExternalLink />} onClick={() => open(`${REPO_URL}/issues`)}>
          Report a problem
        </Button>
      </div>

      <p className="text-xs leading-[18px] text-text-3">
        Wajha is free and open-source software under the MIT License. It works offline, with no account and no tracking. Fonts by their authors
        under the SIL Open Font License.
      </p>
    </div>
  );
}

function DataFolder({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    if (await copyText(path)) setCopied(true);
    else toast.error('Could not copy the path');
  };

  return (
    <div className="flex h-8 items-center gap-1 rounded-md border border-line bg-field pr-1 pl-2.5 light:bg-raised">
      <span dir="ltr" title={path} className="min-w-0 flex-1 truncate font-mono text-2xs text-text-2 select-text">
        {path}
      </span>
      <Button size="sm" variant="ghost" aria-label={copied ? 'Copied' : 'Copy the data folder path'} leadingIcon={copied ? <Check /> : <Copy />} onClick={() => void copy()}>
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  );
}

/** Clipboard API first; the hidden-textarea fallback covers webviews that refuse it. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path.
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
