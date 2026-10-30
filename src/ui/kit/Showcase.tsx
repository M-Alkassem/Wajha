/**
 * Visual QA page for the kit: every component in every state, in dark and
 * light. Open the app with "?kit" (add "&theme=light" to start light). Not
 * part of the product; App.tsx loads it lazily.
 */
import { useEffect, useState, type ReactNode } from 'react';
import {
  Copy,
  Download,
  Ellipsis,
  Eye,
  EyeOff,
  FolderOpen,
  GripVertical,
  Image as ImageIcon,
  ImagePlus,
  Inbox,
  Languages,
  Layers,
  LayoutTemplate,
  Link,
  Lock,
  LockOpen,
  Monitor,
  Moon,
  Palette,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Search,
  Settings,
  Share,
  Smartphone,
  Sparkles,
  Sun,
  Tablet,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignStart,
  Trash2,
  Type,
  Undo2,
  Circle,
} from 'lucide-react';
import type { Fill } from '../../model/types';
import { Logo } from '../brand/Logo';
import { Wordmark } from '../brand/Wordmark';
import { Button } from './Button';
import { Checkbox } from './Checkbox';
import { ColorField } from './ColorField';
import { cx } from './cx';
import { Dialog, DialogContent, DialogTrigger } from './Dialog';
import { EmptyState } from './EmptyState';
import { Field } from './Field';
import { FillEditor } from './FillEditor';
import { IconButton } from './IconButton';
import { Input, Textarea } from './Input';
import { Kbd } from './Kbd';
import { ListRow } from './ListRow';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './Menu';
import { NumberField } from './NumberField';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';
import { ScrollArea } from './ScrollArea';
import { Section } from './Section';
import { SegmentedControl } from './SegmentedControl';
import { Select } from './Select';
import { Slider } from './Slider';
import { Spinner } from './Spinner';
import { Badge, Card, Divider, ProgressBar, Skeleton } from './Surfaces';
import { Switch } from './Switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './Tabs';
import { Toaster } from './Toaster';
import { Tooltip, TooltipProvider } from './Tooltip';
import type { ToastData, ToastKind } from './toast';

type Theme = 'dark' | 'light';

const PALETTE = ['#0E0B1C', '#FFFFFF', '#FF8A3D', '#FF4D7E', '#7C6CFF', '#3DD6C8', '#FFD166', '#1F2A44'];

/* A tiny sample image (a sunset gradient) so the image fill previews without assets. */
const SAMPLE_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b1d5c"/><stop offset=".55" stop-color="#ff4d7e"/><stop offset="1" stop-color="#ffb65c"/></linearGradient></defs><rect width="320" height="200" fill="url(#g)"/><circle cx="160" cy="150" r="46" fill="#ffd9a0" opacity=".85"/><path d="M0 170 Q80 140 160 168 T320 160 V200 H0Z" fill="#1b1236"/></svg>`,
  );

function readInitialTheme(): Theme {
  if (typeof location === 'undefined') return 'dark';
  return new URLSearchParams(location.search).get('theme') === 'light' ? 'light' : 'dark';
}

/** The kit showcase page. */
export function Showcase() {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);
  const [toasts, setToasts] = useState<ToastData[]>([]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // The app shell disables document scrolling; this page is one long document.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'auto';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const pushToast = (kind: ToastKind, withAction = false) => {
    const copy: Record<ToastKind, { title: string; description: string }> = {
      info: { title: 'Fonts are loading', description: 'Arabic text will sharpen in a moment.' },
      success: { title: 'Exported 24 screenshots', description: 'Saved to Desktop/Wajha export.' },
      warning: { title: '2 slides have no screenshot', description: 'They will use the mock screen.' },
      error: { title: 'Could not write the export', description: 'The folder is read-only. Pick another one.' },
    };
    const id = `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((t) => [
      ...t,
      {
        id,
        kind,
        ...copy[kind],
        action: withAction ? { label: 'Show in Finder', onClick: () => undefined } : undefined,
      },
    ]);
  };

  return (
    <TooltipProvider>
      <div className="min-h-full bg-app text-text" data-qa="showcase-ready">
        <header className="sticky top-0 z-40 border-b border-line bg-[var(--glass)] backdrop-blur-xl">
          <div className="mx-auto flex h-14 max-w-[1240px] items-center gap-3 px-8">
            <Wordmark size="sm" />
            <Badge variant="accent">UI kit</Badge>
            <nav className="ml-6 hidden items-center gap-1 lg:flex" aria-label="Sections">
              {['Brand', 'Buttons', 'Inputs', 'Choices', 'Colour', 'Overlays', 'Feedback', 'Layout'].map((s) => (
                <a
                  key={s}
                  href={`#${s.toLowerCase()}`}
                  className="rounded-sm px-2 py-1 text-xs text-text-2 transition-colors hover:bg-surface-2 hover:text-text"
                >
                  {s}
                </a>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-2">
              <SegmentedControl<Theme>
                aria-label="Theme"
                size="sm"
                value={theme}
                onValueChange={setTheme}
                options={[
                  { value: 'dark', label: 'Dark', icon: <Moon /> },
                  { value: 'light', label: 'Light', icon: <Sun /> },
                ]}
              />
            </div>
          </div>
        </header>

        <main className="mx-auto flex max-w-[1240px] flex-col gap-14 px-8 pt-12 pb-24">
          <Hero />
          <BrandSection />
          <TokensSection />
          <ButtonsSection />
          <IconButtonsSection />
          <InputsSection />
          <NumbersSection />
          <ChoicesSection />
          <ColourSection />
          <FillSection />
          <TabsSection />
          <OverlaysSection />
          <FeedbackSection onToast={pushToast} />
          <LayoutSection />
        </main>
        <Toaster toasts={toasts} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
      </div>
    </TooltipProvider>
  );
}

export default Showcase;

/* Layout helpers -------------------------------------------------------------------- */

function Block({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section id={id} data-qa-section={id} className="scroll-mt-20">
      <div className="mb-5 flex items-end justify-between gap-6 border-b border-line pb-3">
        <div>
          <h2 className="text-[17px] font-semibold tracking-[-0.015em] text-text">{title}</h2>
          {description && <p className="mt-1 max-w-[640px] text-ui text-text-2">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Panel({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx('rounded-xl border border-line bg-panel p-5 shadow-[var(--highlight)]', className)}>
      {title && <div className="mb-4 text-2xs font-semibold tracking-[0.06em] text-text-3 uppercase">{title}</div>}
      {children}
    </div>
  );
}

function Row({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-3">
      {label && <div className="w-24 shrink-0 text-xs text-text-3">{label}</div>}
      {children}
    </div>
  );
}

/* Sections --------------------------------------------------------------------------- */

function Hero() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-panel px-10 py-12">
      <div aria-hidden className="pointer-events-none absolute -top-40 -right-24 size-[520px] rounded-full bg-[image:var(--brand-gradient)] opacity-[0.16] blur-3xl" />
      <div className="relative flex flex-col gap-5">
        <Wordmark size="lg" />
        <p className="max-w-[620px] text-[15px] leading-6 text-text-2">
          The design system behind Wajha: calm, dense controls for a pro design tool, a full light theme, and the sunset brand kept for the
          moments that matter.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="brand" size="lg" leadingIcon={<Download />}>
            Export screenshots
          </Button>
          <Button size="lg" leadingIcon={<LayoutTemplate />}>
            Browse templates
          </Button>
          <Button size="lg" variant="ghost" trailingIcon={<Kbd keys="mod+k" />}>
            Command menu
          </Button>
        </div>
      </div>
    </div>
  );
}

function BrandSection() {
  return (
    <Block id="brand" title="Brand" description="The mark is an arched shop window, the storefront of واجهة, glowing with a sunset, with a phone standing in it.">
      <div className="grid grid-cols-[1.4fr_1fr] gap-4">
        <Panel title="Mark">
          <div className="flex items-end gap-7">
            {[16, 20, 24, 32, 48, 64, 96].map((s) => (
              <div key={s} className="flex flex-col items-center gap-2">
                <Logo size={s} />
                <span className="text-2xs text-text-3 tabular-nums">{s}</span>
              </div>
            ))}
            <div className="flex flex-col items-center gap-2 text-text">
              <Logo size={48} variant="mono" />
              <span className="text-2xs text-text-3">mono</span>
            </div>
          </div>
        </Panel>
        <Panel title="App icon">
          <div className="flex items-center gap-6">
            <div className="relative flex size-[112px] items-center justify-center rounded-[26px] bg-[linear-gradient(180deg,#1d1442,#0b0918)] shadow-[0_12px_30px_-10px_rgba(0,0,0,0.6),inset_0_0_0_1px_rgba(255,255,255,0.08)]">
              <div className="absolute inset-0 rounded-[26px] bg-[radial-gradient(60%_50%_at_50%_58%,rgba(255,77,126,0.32),transparent)]" />
              <Logo size={78} title="Wajha app icon" className="relative drop-shadow-[0_0_18px_rgba(255,90,120,0.45)]" />
            </div>
            <div className="flex flex-col gap-3">
              <Wordmark size="md" />
              <Wordmark size="sm" showArabic={false} />
            </div>
          </div>
        </Panel>
      </div>
    </Block>
  );
}

const TOKEN_GROUPS: Array<{ title: string; tokens: string[] }> = [
  { title: 'Surfaces', tokens: ['stage', 'app', 'panel', 'surface', 'surface-2', 'surface-3', 'popover', 'raised'] },
  { title: 'Text', tokens: ['text', 'text-2', 'text-3'] },
  { title: 'Accent & status', tokens: ['accent', 'accent-fg', 'accent-soft', 'success', 'warning', 'danger', 'danger-solid'] },
  // Primary and danger button fills, a row per state: rest, hover, pressed.
  { title: 'Button states', tokens: ['accent', 'danger-solid', 'accent-2', 'danger-solid-2', 'accent-3', 'danger-solid-3'] },
];

function TokensSection() {
  return (
    <Block id="tokens" title="Tokens" description="Semantic colours with Tailwind names (bg-panel, text-text-2, border-line…). Every text token keeps 4.5:1 on panels.">
      <div className="grid grid-cols-3 gap-4">
        {TOKEN_GROUPS.map((g) => (
          <Panel key={g.title} title={g.title}>
            <div className="grid grid-cols-2 gap-2">
              {g.tokens.map((t) => (
                <div key={t} className="flex items-center gap-2.5">
                  <span className="kit-checker size-8 shrink-0 overflow-hidden rounded-md shadow-[inset_0_0_0_1px_var(--line)]">
                    <span className="block size-full" style={{ background: `var(--${t})` }} />
                  </span>
                  <span className="truncate font-mono text-2xs text-text-2">{t}</span>
                </div>
              ))}
            </div>
          </Panel>
        ))}
      </div>
      <div className="mt-4 h-10 rounded-lg bg-[image:var(--brand-gradient)] shadow-brand" />
    </Block>
  );
}

function ButtonsSection() {
  const variants = ['primary', 'secondary', 'ghost', 'danger', 'brand'] as const;
  return (
    <Block id="buttons" title="Buttons" description="Secondary is the default. Primary for the main action of a view, brand only for Export.">
      <Panel>
        <div className="flex flex-col gap-2">
          {variants.map((v) => (
            <Row key={v} label={v}>
              <Button variant={v} size="sm">
                Small
              </Button>
              <Button variant={v}>Medium</Button>
              <Button variant={v} size="lg">
                Large
              </Button>
              <Button variant={v} leadingIcon={v === 'danger' ? <Trash2 /> : v === 'brand' ? <Download /> : <Plus />}>
                {v === 'danger' ? 'Delete' : v === 'brand' ? 'Export' : 'Add slide'}
              </Button>
              <Button variant={v} trailingIcon={<Share />}>
                Share
              </Button>
              <Button variant={v} loading>
                Saving
              </Button>
              <Button variant={v} loading leadingIcon={<Download />}>
                Exporting
              </Button>
              <Button variant={v} disabled>
                Disabled
              </Button>
            </Row>
          ))}
          <Row label="full width">
            <div className="w-[320px]">
              <Button variant="primary" fullWidth size="lg">
                Create project
              </Button>
            </div>
          </Row>
        </div>
      </Panel>
    </Block>
  );
}

function IconButtonsSection() {
  const [grid, setGrid] = useState(true);
  const [align, setAlign] = useState<'start' | 'center' | 'end'>('start');
  return (
    <Block id="icon-buttons" title="Icon buttons, tooltips and shortcuts" description="Every icon button has a label, shown as a tooltip after 400 ms with its shortcut.">
      <div className="grid grid-cols-2 gap-4">
        <Panel title="Icon buttons">
          <div className="flex flex-col gap-2">
            <Row label="ghost">
              <IconButton size="sm" label="Undo" shortcut="mod+z" icon={<Undo2 />} />
              <IconButton label="Redo" shortcut="mod+shift+z" icon={<Redo2 />} data-qa="tooltip-target" />
              <IconButton size="lg" label="Settings" shortcut="mod+," icon={<Settings />} />
              <IconButton label="Show grid" active={grid} onClick={() => setGrid((g) => !g)} icon={<Layers />} />
              <IconButton label="Disabled" disabled icon={<Copy />} />
              <IconButton label="Loading" loading icon={<Copy />} />
            </Row>
            <Row label="solid">
              <IconButton variant="solid" size="sm" label="Add" icon={<Plus />} />
              <IconButton variant="solid" label="Duplicate" shortcut="mod+d" icon={<Copy />} />
              <IconButton variant="solid" size="lg" label="Languages" icon={<Languages />} />
              <IconButton variant="solid" label="Pressed" active icon={<Sparkles />} />
              <IconButton variant="solid" label="Disabled" disabled icon={<Trash2 />} />
            </Row>
            <Row label="toolbar">
              <div className="flex items-center gap-0.5 rounded-md border border-line bg-surface p-0.5">
                {(
                  [
                    ['start', <TextAlignStart key="s" />, 'Align start'],
                    ['center', <TextAlignCenter key="c" />, 'Align centre'],
                    ['end', <TextAlignEnd key="e" />, 'Align end'],
                  ] as const
                ).map(([v, icon, label]) => (
                  <IconButton key={v} size="sm" label={label} active={align === v} onClick={() => setAlign(v)} icon={icon} />
                ))}
              </div>
            </Row>
          </div>
        </Panel>
        <Panel title="Tooltips and keys">
          <div className="flex flex-col gap-3">
            <Row label="tooltip">
              <Tooltip content="Tooltip with a shortcut" shortcut="mod+e" open side="right">
                <Button size="sm">Always open</Button>
              </Tooltip>
            </Row>
            <Row label="macOS">
              <Kbd keys="mod+shift+z" mac />
              <Kbd keys="mod+," mac />
              <Kbd keys="alt+arrowup" mac />
              <Kbd keys="escape" mac />
              <Kbd keys="mod+shift+e" mac tone="plain" />
            </Row>
            <Row label="Windows">
              <Kbd keys="mod+shift+z" mac={false} />
              <Kbd keys="mod+," mac={false} />
              <Kbd keys="delete" mac={false} />
              <Kbd keys="mod+shift+e" mac={false} tone="plain" />
            </Row>
          </div>
        </Panel>
      </div>
    </Block>
  );
}

function InputsSection() {
  const [name, setName] = useState('Habit tracker');
  const [query, setQuery] = useState('');
  const [copy, setCopy] = useState('Track every *habit*\nin one place');
  const [arabic, setArabic] = useState('تتبّع كل *عاداتك* في مكان واحد');
  return (
    <Block id="inputs" title="Text inputs" description="Filled fields with an accent halo on focus. dir=auto everywhere, so Arabic and Hebrew type right-to-left.">
      <div className="grid grid-cols-2 gap-4">
        <Panel title="Input">
          <div className="flex flex-col gap-3">
            <Field label="Project" layout="stacked">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Untitled" />
            </Field>
            <Input
              leadingIcon={<Search />}
              placeholder="Search templates"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              suffix={<Kbd keys="mod+f" />}
            />
            <Input leadingIcon={<Link />} defaultValue="https://wajha.app" suffix={<span className="text-xs">https</span>} />
            <Field label="Bundle id" layout="stacked" error="Use reverse-DNS, e.g. com.example.app">
              <Input defaultValue="habit tracker" />
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <Input size="sm" placeholder="Small" />
              <Input placeholder="Medium" />
              <Input size="lg" placeholder="Large" />
            </div>
            <Input disabled defaultValue="Disabled" />
          </div>
        </Panel>
        <Panel title="Textarea">
          <div className="flex flex-col gap-3">
            <Field label="Headline (auto-grow)" layout="stacked" hint="*word* highlights, Enter adds a line break.">
              <Textarea autoGrow minRows={2} maxRows={6} value={copy} onChange={(e) => setCopy(e.target.value)} />
            </Field>
            <Field label="العنوان (Arabic)" layout="stacked">
              <Textarea autoGrow minRows={2} value={arabic} onChange={(e) => setArabic(e.target.value)} lang="ar" />
            </Field>
            <Textarea placeholder="Resizable notes…" minRows={3} />
          </div>
        </Panel>
      </div>
    </Block>
  );
}

function NumbersSection() {
  const [pos, setPos] = useState({ x: 50, y: 62.5, w: 78, rot: 0, opacity: 100 });
  const [slider, setSlider] = useState(64);
  const [blur, setBlur] = useState(2.5);
  const [scrubs, setScrubs] = useState(0);
  const [commits, setCommits] = useState(0);
  return (
    <Block id="numbers" title="Numbers and sliders" description="Drag a field's label to scrub (Shift ×10, Alt ×0.1), use the arrow keys, or type maths like 120/2.">
      <div className="grid grid-cols-2 gap-4">
        <Panel title="Number fields">
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="X"
              value={pos.x}
              unit="%"
              step={0.1}
              min={-50}
              max={150}
              onChange={(x) => setPos((p) => ({ ...p, x }))}
              onCommit={() => setCommits((n) => n + 1)}
              onScrubEnd={() => setScrubs((n) => n + 1)}
            />
            <NumberField label="Y" value={pos.y} unit="%" step={0.1} min={-50} max={150} onChange={(y) => setPos((p) => ({ ...p, y }))} onScrubEnd={() => setScrubs((n) => n + 1)} />
            <NumberField label="W" value={pos.w} unit="%" step={0.5} min={1} max={300} onChange={(w) => setPos((p) => ({ ...p, w }))} />
            <NumberField
              label={<RotateCw />}
              aria-label="Rotation"
              labelTitle="Rotation"
              value={pos.rot}
              unit="°"
              min={0}
              max={360}
              wrap
              onChange={(rot) => setPos((p) => ({ ...p, rot }))}
            />
            <NumberField aria-label="Opacity" value={pos.opacity} unit="%" min={0} max={100} onChange={(opacity) => setPos((p) => ({ ...p, opacity }))} />
            <NumberField label="H" aria-label="Height" value={Number.NaN} placeholder="Mixed" onChange={() => undefined} />
            <NumberField size="sm" label="S" aria-label="Small" value={12} onChange={() => undefined} />
            <NumberField size="lg" label="L" aria-label="Large" value={1320} unit="px" onChange={() => undefined} />
            <NumberField label="D" aria-label="Disabled" value={42} disabled onChange={() => undefined} />
          </div>
          <p className="mt-3 text-xs text-text-3">
            Scrub gestures finished: {scrubs} · X commits: <span data-qa="x-commits">{commits}</span>
          </p>
        </Panel>
        <Panel title="Sliders">
          <div className="flex flex-col gap-4">
            <Field label="Opacity">
              <Slider value={slider} onChange={setSlider} bubble format={(v) => `${v}%`} />
            </Field>
            <Field label="Blur">
              <Slider value={blur} onChange={setBlur} min={0} max={10} step={0.1} bubble="always" />
            </Field>
            <Field label="Disabled">
              <Slider value={30} onChange={() => undefined} disabled />
            </Field>
          </div>
        </Panel>
      </div>
    </Block>
  );
}

function ChoicesSection() {
  const [device, setDevice] = useState('iphone');
  const [font, setFont] = useState<string | undefined>(undefined);
  const [finish, setFinish] = useState<'metal' | 'matte' | 'clay'>('metal');
  const [family, setFamily] = useState<'phone' | 'tablet' | 'mac'>('phone');
  const [align, setAlign] = useState<'start' | 'center' | 'end'>('center');
  const [panorama, setPanorama] = useState(true);
  const [hints, setHints] = useState(false);
  const [langs, setLangs] = useState<boolean | 'indeterminate'>('indeterminate');
  return (
    <Block id="choices" title="Choices" description="Select, segmented controls with a gliding thumb, switches and checkboxes.">
      <div className="grid grid-cols-3 gap-4">
        <Panel title="Select">
          <div className="flex flex-col gap-3">
            <Select
              aria-label="Device"
              value={device}
              onValueChange={setDevice}
              options={[
                { value: 'iphone', label: 'iPhone 17 Pro', icon: <Smartphone /> },
                { value: 'ipad', label: 'iPad Pro 13″', icon: <Tablet /> },
                { value: 'mac', label: 'MacBook Pro', icon: <Monitor /> },
                { value: 'none', label: 'No frame', disabled: true },
              ]}
            />
            <div data-qa="open-select">
              <Select
                aria-label="Font"
                value={font}
                onValueChange={setFont}
                placeholder="Choose a font"
                groups={[
                  {
                    label: 'Sans',
                    options: [
                      { value: 'inter', label: 'Inter', description: 'Neutral, very legible' },
                      { value: 'jakarta', label: 'Plus Jakarta Sans' },
                      { value: 'manrope', label: 'Manrope' },
                    ],
                  },
                  {
                    label: 'Arabic',
                    options: [
                      { value: 'cairo', label: 'Cairo' },
                      { value: 'readex', label: 'Readex Pro' },
                    ],
                  },
                ]}
              />
            </div>
            <div className="flex items-center gap-2">
              <Select aria-label="Zoom" size="sm" variant="ghost" defaultValue="fit" className="w-auto" options={[{ value: 'fit', label: 'Fit' }, { value: '100', label: '100%' }]} />
              <Select aria-label="Disabled" size="sm" disabled defaultValue="a" options={[{ value: 'a', label: 'Disabled' }]} />
            </div>
          </div>
        </Panel>
        <Panel title="Segmented">
          <div className="flex flex-col gap-3">
            <SegmentedControl
              aria-label="Finish"
              fullWidth
              value={finish}
              onValueChange={setFinish}
              options={[
                { value: 'metal', label: 'Metal' },
                { value: 'matte', label: 'Matte' },
                { value: 'clay', label: 'Clay' },
              ]}
            />
            <SegmentedControl
              aria-label="Family"
              value={family}
              onValueChange={setFamily}
              options={[
                { value: 'phone', label: 'Phone', icon: <Smartphone /> },
                { value: 'tablet', label: 'Tablet', icon: <Tablet /> },
                { value: 'mac', label: 'Mac', icon: <Monitor /> },
              ]}
            />
            <div className="flex items-center gap-3">
              <SegmentedControl
                aria-label="Alignment"
                size="sm"
                value={align}
                onValueChange={setAlign}
                options={[
                  { value: 'start', icon: <TextAlignStart />, tooltip: 'Align start' },
                  { value: 'center', icon: <TextAlignCenter />, tooltip: 'Align centre' },
                  { value: 'end', icon: <TextAlignEnd />, tooltip: 'Align end' },
                ]}
              />
              <SegmentedControl aria-label="Disabled" size="sm" disabled value="a" onValueChange={() => undefined} options={[{ value: 'a', label: 'Off' }, { value: 'b', label: 'On' }]} />
            </div>
            <SegmentedControl
              aria-label="Large"
              size="lg"
              value={family}
              onValueChange={setFamily}
              options={[
                { value: 'phone', label: 'Phone' },
                { value: 'tablet', label: 'Tablet' },
                { value: 'mac', label: 'Mac' },
              ]}
            />
          </div>
        </Panel>
        <Panel title="Switch and checkbox">
          <div className="flex flex-col gap-3.5">
            <Switch label="Panorama background" checked={panorama} onCheckedChange={setPanorama} />
            <Switch label="Show hints" checked={hints} onCheckedChange={setHints} />
            <div className="flex items-center gap-3">
              <Switch aria-label="Small on" size="sm" defaultChecked />
              <Switch aria-label="Small off" size="sm" />
              <Switch aria-label="Disabled on" disabled defaultChecked />
              <Switch aria-label="Disabled off" disabled />
            </div>
            <Divider />
            <Checkbox label="All languages" checked={langs} onCheckedChange={setLangs} />
            <Checkbox label="Arabic" description="Right-to-left, store locale ar-SA" defaultChecked />
            <Checkbox label="Hebrew" />
            <Checkbox label="Disabled" disabled defaultChecked />
          </div>
        </Panel>
      </div>
    </Block>
  );
}

function ColourSection() {
  const [text, setText] = useState('#FFFFFF');
  const [glow, setGlow] = useState('#FF4D7E99');
  const [base, setBase] = useState('#0E0B1C');
  const [commits, setCommits] = useState(0);
  return (
    <Block id="colour" title="Colour" description="Hex is validated on Enter or blur, alpha is a percentage, and colours you commit appear under Recent.">
      <div className="grid grid-cols-2 gap-4">
        <Panel title="Colour field">
          <div className="flex flex-col gap-2.5">
            <Field label="Text">
              <div data-qa="color-trigger">
                <ColorField value={text} onChange={setText} palette={PALETTE} onCommit={() => setCommits((n) => n + 1)} />
              </div>
            </Field>
            <Field label="Glow">
              <ColorField value={glow} onChange={setGlow} palette={PALETTE} onCommit={() => setCommits((n) => n + 1)} />
            </Field>
            <Field label="No alpha">
              <ColorField value={base} onChange={setBase} alpha={false} palette={PALETTE} />
            </Field>
            <Field label="Disabled">
              <ColorField value="#7C6CFF" onChange={() => undefined} disabled />
            </Field>
            <p className="text-xs text-text-3">Committed colour changes: {commits}</p>
          </div>
        </Panel>
        <Panel title="Swatch only">
          <div className="flex items-center gap-3">
            <ColorField showInput={false} size="sm" label="Small" value={text} onChange={setText} palette={PALETTE} />
            <ColorField showInput={false} label="Medium" value={glow} onChange={setGlow} palette={PALETTE} />
            <ColorField showInput={false} size="lg" label="Large" value={base} onChange={setBase} palette={PALETTE} />
            <ColorField showInput={false} label="Disabled" value="#3DD6C8" onChange={() => undefined} disabled />
          </div>
        </Panel>
      </div>
    </Block>
  );
}

const FILLS: Fill[] = [
  { type: 'linear', angle: 160, stops: [{ offset: 0, color: '#7C6CFF' }, { offset: 0.55, color: '#FF4D7E' }, { offset: 1, color: '#FFB65C' }] },
  {
    type: 'mesh',
    base: '#120D2A',
    points: [
      { x: 0.2, y: 0.25, color: '#7C6CFF', radius: 0.55 },
      { x: 0.8, y: 0.3, color: '#FF4D7E', radius: 0.5 },
      { x: 0.45, y: 0.85, color: '#FF8A3D', radius: 0.5 },
    ],
  },
  { type: 'image', assetId: 'sample', fit: 'cover', opacity: 1, blur: 0, tint: '#0E0B1C40' },
];

function FillSection() {
  const [fills, setFills] = useState<Fill[]>(FILLS);
  const [commits, setCommits] = useState(0);
  return (
    <Block id="fill" title="Fill editor" description="Solid, linear, radial, mesh and image fills. Click the bar to add a stop, drag one off to remove it, drag mesh points in the preview.">
      <div className="grid grid-cols-3 gap-4">
        {fills.map((f, i) => (
          <Panel key={i} title={['Linear', 'Mesh', 'Image'][i]}>
            <FillEditor
              value={f}
              palette={PALETTE}
              onChange={(next) => setFills((all) => all.map((x, j) => (j === i ? next : x)))}
              onCommit={() => setCommits((n) => n + 1)}
              onPickImage={() => Promise.resolve('sample')}
              getImageUrl={() => SAMPLE_IMAGE}
            />
          </Panel>
        ))}
      </div>
      <p className="mt-3 text-xs text-text-3">Fill commits: {commits}</p>
    </Block>
  );
}

function TabsSection() {
  return (
    <Block id="tabs" title="Tabs" description="Underline tabs for sections, pill tabs for compact switches; the indicator glides between them.">
      <div className="grid grid-cols-2 gap-4">
        <Panel title="Underline">
          <Tabs defaultValue="design">
            <TabsList>
              <TabsTrigger value="design">Design</TabsTrigger>
              <TabsTrigger value="texts">Texts</TabsTrigger>
              <TabsTrigger value="languages">Languages</TabsTrigger>
              <TabsTrigger value="export" disabled>
                Export
              </TabsTrigger>
            </TabsList>
            <TabsContent value="design" className="pt-4 text-ui text-text-2">
              Theme, background and fonts for every slide.
            </TabsContent>
            <TabsContent value="texts" className="pt-4 text-ui text-text-2">
              Every headline and subtitle, per language.
            </TabsContent>
            <TabsContent value="languages" className="pt-4 text-ui text-text-2">
              Add Arabic, Hebrew, Japanese…
            </TabsContent>
          </Tabs>
        </Panel>
        <Panel title="Pill">
          <Tabs defaultValue="builtin">
            <TabsList variant="pill" fullWidth>
              <TabsTrigger value="builtin">Built-in</TabsTrigger>
              <TabsTrigger value="community">Community</TabsTrigger>
              <TabsTrigger value="mine">My templates</TabsTrigger>
            </TabsList>
            <TabsContent value="builtin" className="pt-4 text-ui text-text-2">
              Twelve templates designed in-house.
            </TabsContent>
            <TabsContent value="community" className="pt-4 text-ui text-text-2">
              Shared by the community on GitHub.
            </TabsContent>
            <TabsContent value="mine" className="pt-4 text-ui text-text-2">
              Saved from your own projects.
            </TabsContent>
          </Tabs>
        </Panel>
      </div>
    </Block>
  );
}

function OverlaysSection() {
  const [showGuides, setShowGuides] = useState(true);
  const [showRulers, setShowRulers] = useState(false);
  const [zoom, setZoom] = useState('fit');
  return (
    <Block id="overlays" title="Overlays" description="Dialogs, popovers, dropdown and context menus share one surface, border and motion.">
      <div className="grid grid-cols-3 gap-4">
        <Panel title="Dialog">
          <div className="flex flex-wrap gap-2">
            {(['sm', 'md', 'lg', 'xl', 'full'] as const).map((size) => (
              <Dialog key={size}>
                <DialogTrigger asChild>
                  <Button size="sm" data-qa={size === 'md' ? 'open-dialog' : undefined}>
                    {size.toUpperCase()}
                  </Button>
                </DialogTrigger>
                <DialogContent
                  size={size}
                  icon={<Download />}
                  title="Export screenshots"
                  description="24 images at store sizes, as PNG without alpha."
                  footerStart={<Checkbox label="Open folder when done" defaultChecked />}
                  footer={
                    <>
                      <Button>Cancel</Button>
                      <Button variant="brand" leadingIcon={<Download />}>
                        Export
                      </Button>
                    </>
                  }
                >
                  <div className="flex flex-col gap-3">
                    <Field label="Format" layout="stacked">
                      <SegmentedControl aria-label="Format" fullWidth value="png" onValueChange={() => undefined} options={[{ value: 'png', label: 'PNG' }, { value: 'jpeg', label: 'JPEG' }]} />
                    </Field>
                    <Field label="Folder structure" layout="stacked" hint="fastlane works with deliver and supply.">
                      <Select
                        aria-label="Folder structure"
                        defaultValue="stores"
                        options={[
                          { value: 'stores', label: 'By store', description: 'App Store / Google Play folders' },
                          { value: 'fastlane', label: 'fastlane', description: 'Ready for deliver and supply' },
                          { value: 'flat', label: 'Flat', description: 'One folder per size' },
                        ]}
                      />
                    </Field>
                    <Card padding="sm" className="flex items-center gap-3">
                      <ProgressBar value={0.42} label="Export progress" showValue tone="brand" />
                    </Card>
                    {size === 'full' && <Skeleton lines={12} height={14} />}
                  </div>
                </DialogContent>
              </Dialog>
            ))}
          </div>
        </Panel>
        <Panel title="Popover and menus">
          <div className="flex flex-wrap items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" leadingIcon={<Palette />}>
                  Popover
                </Button>
              </PopoverTrigger>
              <PopoverContent width={260} title="Slide background">
                <div className="flex flex-col gap-2.5">
                  <Field label="Panorama">
                    <Switch aria-label="Panorama" defaultChecked />
                  </Field>
                  <Field label="Opacity">
                    <Slider value={80} onChange={() => undefined} />
                  </Field>
                </div>
              </PopoverContent>
            </Popover>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" trailingIcon={<Ellipsis />} data-qa="open-menu">
                  Menu
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Slide 3</DropdownMenuLabel>
                <DropdownMenuItem icon={<Copy />} shortcut="mod+d">
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem icon={<ImagePlus />} shortcut="mod+i">
                  Replace screenshot…
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger icon={<Share />}>Move to</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem>First</DropdownMenuItem>
                    <DropdownMenuItem>Last</DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem checked={showGuides} onCheckedChange={setShowGuides} shortcut="mod+;">
                  Show guides
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={showRulers} onCheckedChange={setShowRulers}>
                  Show rulers
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup value={zoom} onValueChange={setZoom}>
                  <DropdownMenuRadioItem value="fit">Zoom to fit</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="100" shortcut="mod+0">
                    Actual size
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem icon={<Trash2 />} shortcut="delete" danger>
                  Delete slide
                </DropdownMenuItem>
                <DropdownMenuItem icon={<FolderOpen />} disabled>
                  Reveal in Finder
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </Panel>
        <Panel title="Context menu">
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <div
                data-qa="context-area"
                className="flex h-[104px] items-center justify-center rounded-lg border border-dashed border-line-strong text-xs text-text-3"
              >
                Right-click here
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem icon={<Copy />} shortcut="mod+c">
                Copy
              </ContextMenuItem>
              <ContextMenuItem icon={<Copy />} shortcut="mod+d">
                Duplicate
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem icon={<Trash2 />} shortcut="delete" danger>
                Delete
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </Panel>
      </div>
    </Block>
  );
}

function FeedbackSection({ onToast }: { onToast: (kind: ToastKind, withAction?: boolean) => void }) {
  const [progress, setProgress] = useState(0.35);
  const sample: ToastData[] = [
    { id: 's1', kind: 'success', title: 'Exported 24 screenshots', description: 'Saved to Desktop/Wajha export.', action: { label: 'Show in Finder', onClick: () => undefined }, duration: 0 },
    { id: 's2', kind: 'error', title: 'Could not read “shot.heic”', description: 'Use PNG, JPEG or WebP.', duration: 0 },
  ];
  return (
    <Block id="feedback" title="Feedback" description="Toasts, badges, spinners, progress, skeletons and empty states.">
      <div className="grid grid-cols-[1fr_1fr] gap-4">
        <Panel title="Toasts">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => onToast('info')}>
              Info
            </Button>
            <Button size="sm" onClick={() => onToast('success', true)}>
              Success + action
            </Button>
            <Button size="sm" onClick={() => onToast('warning')}>
              Warning
            </Button>
            <Button size="sm" onClick={() => onToast('error')}>
              Error
            </Button>
          </div>
          <div className="mt-4">
            <Toaster inline toasts={sample} onDismiss={() => undefined} />
          </div>
        </Panel>
        <div className="flex flex-col gap-4">
          <Panel title="Badges and spinners">
            <div className="flex flex-col gap-3">
              <Row>
                <Badge>Draft</Badge>
                <Badge variant="accent">New</Badge>
                <Badge variant="success" dot>
                  Saved
                </Badge>
                <Badge variant="warning" dot>
                  2 missing
                </Badge>
                <Badge variant="danger">Overflow</Badge>
                <Badge size="sm">10</Badge>
                <Badge size="sm" variant="accent">
                  RTL
                </Badge>
              </Row>
              <Row>
                <Spinner size={12} />
                <Spinner />
                <Spinner size={20} className="text-accent-fg" />
                <Spinner size={24} className="text-text-3" />
              </Row>
            </div>
          </Panel>
          <Panel title="Progress">
            <div className="flex flex-col gap-3.5">
              <ProgressBar value={progress} label="Export" showValue />
              <ProgressBar value={0.72} tone="brand" label="Brand" showValue />
              <ProgressBar value={1} tone="success" size="sm" label="Done" />
              <ProgressBar value={null} label="Preparing" />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => setProgress((p) => Math.max(0, Math.round((p - 0.1) * 10) / 10))}>
                  −10%
                </Button>
                <Button size="sm" onClick={() => setProgress((p) => Math.min(1, Math.round((p + 0.1) * 10) / 10))}>
                  +10%
                </Button>
              </div>
            </div>
          </Panel>
        </div>
        <Panel title="Skeleton">
          <div className="flex gap-4">
            <Skeleton width={96} height={150} radius="lg" />
            <div className="flex flex-1 flex-col gap-3 pt-1">
              <Skeleton width="60%" height={14} />
              <Skeleton lines={3} height={10} />
              <div className="flex gap-2 pt-2">
                <Skeleton width={72} height={28} />
                <Skeleton width={28} height={28} radius="full" />
              </div>
            </div>
          </div>
        </Panel>
        <Panel title="Empty state">
          <EmptyState
            icon={<Inbox />}
            title="No projects yet"
            description="Start from a template or drop screenshots here. Everything stays on this Mac."
            actions={
              <>
                <Button variant="primary" leadingIcon={<Plus />}>
                  New project
                </Button>
                <Button leadingIcon={<FolderOpen />}>Open…</Button>
              </>
            }
          />
        </Panel>
      </div>
    </Block>
  );
}

function LayoutSection() {
  const [selected, setSelected] = useState('headline');
  const [layers, setLayers] = useState([
    { id: 'headline', name: 'Headline', icon: <Type />, hidden: false, locked: false },
    { id: 'subtitle', name: 'Subtitle', icon: <Type />, hidden: false, locked: false },
    { id: 'device', name: 'iPhone 17 Pro', icon: <Smartphone />, hidden: false, locked: true },
    { id: 'glow', name: 'Glow', icon: <Circle />, hidden: true, locked: false },
    { id: 'badge', name: 'App Store badge', icon: <ImageIcon />, hidden: false, locked: false },
  ]);
  const [pos, setPos] = useState({ x: 50, y: 58, w: 78, rot: 0 });
  const [frame, setFrame] = useState('iphone');
  const [finish, setFinish] = useState<'metal' | 'matte' | 'clay'>('clay');
  const [color, setColor] = useState('#E9E4FF');
  const [shadow, setShadow] = useState(true);
  const [bg, setBg] = useState<Fill>({ type: 'radial', cx: 0.5, cy: 0.35, radius: 0.8, stops: [{ offset: 0, color: '#3B2C7A' }, { offset: 1, color: '#0E0B1C' }] });

  const toggle = (id: string, key: 'hidden' | 'locked') => setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, [key]: !l[key] } : l)));

  return (
    <Block id="layout" title="Layout" description="Inspector sections and fields, layer rows with hover actions and inline rename, cards and scroll areas.">
      <div className="grid grid-cols-[300px_260px_1fr] items-start gap-4">
        <div className="overflow-hidden rounded-xl border border-line bg-panel" data-qa="inspector">
          <div className="flex h-10 items-center gap-2 border-b border-line px-3">
            <Smartphone className="size-3.5 text-text-2" />
            <span className="text-xs font-semibold">Device</span>
            <div className="ml-auto flex items-center">
              <IconButton size="sm" label="More" icon={<Ellipsis />} />
            </div>
          </div>
          <Section title="Position" action={<IconButton size="sm" label="Reset position" icon={<RotateCcw />} />}>
            <div className="grid grid-cols-2 gap-1.5">
              <NumberField label="X" value={pos.x} unit="%" step={0.1} onChange={(x) => setPos((p) => ({ ...p, x }))} />
              <NumberField label="Y" value={pos.y} unit="%" step={0.1} onChange={(y) => setPos((p) => ({ ...p, y }))} />
              <NumberField label="W" value={pos.w} unit="%" step={0.5} min={1} onChange={(w) => setPos((p) => ({ ...p, w }))} />
              <NumberField label={<RotateCw />} aria-label="Rotation" value={pos.rot} unit="°" min={0} max={360} wrap onChange={(rot) => setPos((p) => ({ ...p, rot }))} />
            </div>
          </Section>
          <Section title="Frame">
            <Field label="Device">
              <Select
                value={frame}
                onValueChange={setFrame}
                options={[
                  { value: 'iphone', label: 'iPhone' },
                  { value: 'android-phone', label: 'Android phone' },
                  { value: 'none', label: 'No frame' },
                ]}
              />
            </Field>
            <Field label="Finish">
              <SegmentedControl
                fullWidth
                size="sm"
                value={finish}
                onValueChange={setFinish}
                options={[
                  { value: 'metal', label: 'Metal' },
                  { value: 'matte', label: 'Matte' },
                  { value: 'clay', label: 'Clay' },
                ]}
              />
            </Field>
            <Field label="Colour">
              <ColorField value={color} onChange={setColor} alpha={false} palette={PALETTE} />
            </Field>
            <Field label="Shadow">
              <Switch checked={shadow} onCheckedChange={setShadow} />
            </Field>
          </Section>
          <Section title="Background" defaultOpen>
            <FillEditor value={bg} onChange={setBg} palette={PALETTE} />
          </Section>
          <Section title="Effects" defaultOpen={false} borderless>
            <Field label="Glow">
              <Slider value={40} onChange={() => undefined} />
            </Field>
          </Section>
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-line bg-panel">
            <div className="flex h-10 items-center justify-between border-b border-line pr-1.5 pl-3">
              <span className="text-xs font-semibold">Layers</span>
              <IconButton size="sm" label="Add layer" icon={<Plus />} />
            </div>
            <div role="listbox" aria-label="Layers" className="flex flex-col gap-px p-1.5">
              {layers.map((l, i) => (
                <ListRow
                  key={l.id}
                  label={l.name}
                  icon={l.icon}
                  selected={selected === l.id}
                  muted={l.hidden}
                  indent={i === 1 ? 1 : 0}
                  dragHandle={<GripVertical />}
                  onSelect={() => setSelected(l.id)}
                  onRename={(name) => setLayers((ls) => ls.map((x) => (x.id === l.id ? { ...x, name } : x)))}
                  trailingVisible={l.hidden || l.locked}
                  trailing={
                    <>
                      <IconButton
                        size="sm"
                        tooltip={false}
                        label={l.locked ? 'Unlock' : 'Lock'}
                        icon={l.locked ? <Lock /> : <LockOpen />}
                        className="size-5"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggle(l.id, 'locked');
                        }}
                      />
                      <IconButton
                        size="sm"
                        tooltip={false}
                        label={l.hidden ? 'Show' : 'Hide'}
                        icon={l.hidden ? <EyeOff /> : <Eye />}
                        className="size-5"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggle(l.id, 'hidden');
                        }}
                      />
                    </>
                  }
                />
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-line bg-panel">
            <div className="flex h-10 items-center border-b border-line px-3 text-xs font-semibold">Slides</div>
            <div role="listbox" aria-label="Slides" className="flex flex-col gap-px p-1.5">
              {['Track every habit', 'Streaks that stick', 'Insights'].map((s, i) => (
                <ListRow key={s} size="md" label={s} meta={`${i + 1}`} selected={i === 0} icon={<Smartphone />} />
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            {['Sunset Glow', 'Paper', 'Night Mode'].map((name, i) => (
              <Card key={name} interactive selected={i === 0} padding="none" tabIndex={0} className="overflow-hidden">
                <div
                  className="h-[92px]"
                  style={{
                    background: [
                      'linear-gradient(160deg,#7C6CFF,#FF4D7E 55%,#FFB65C)',
                      'linear-gradient(180deg,#F7F3EC,#E8E1D4)',
                      'radial-gradient(80% 60% at 50% 30%,#3B2C7A,#0E0B1C)',
                    ][i],
                  }}
                />
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="truncate text-xs font-medium">{name}</span>
                  <Badge size="sm">{6 + i}</Badge>
                </div>
              </Card>
            ))}
          </div>
          <Panel title="Scroll area">
            <ScrollArea className="h-[132px] rounded-md border border-line bg-surface">
              <div className="flex flex-col p-1.5">
                {Array.from({ length: 18 }, (_, i) => (
                  <ListRow key={i} label={`Arabic screenshot ${String(i + 1).padStart(2, '0')}.png — a very long file name that truncates`} icon={<ImageIcon />} />
                ))}
              </div>
            </ScrollArea>
          </Panel>
          <Panel title="Dividers">
            <div className="flex flex-col gap-4">
              <Divider />
              <Divider label="or" />
              <div className="flex h-6 items-center gap-3 text-xs text-text-2">
                <span>Left</span>
                <Divider orientation="vertical" />
                <span>Right</span>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </Block>
  );
}
