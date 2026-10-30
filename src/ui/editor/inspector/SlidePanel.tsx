/**
 * What the inspector shows when nothing is selected: the active slide
 * (background override, screenshots per language, its own layout), the
 * theme (background, panorama, mock screens, palette, fonts) and the
 * project (device families, languages).
 */
import { memo, useCallback, useId, useMemo, useState, type ReactNode } from 'react';
import { Languages, LayoutTemplate, MonitorSmartphone, RotateCcw, Settings2, Type } from 'lucide-react';
import { FAMILIES, languageInfo } from '../../../model/catalog';
import { deepClone } from '../../../model/clone';
import { resolveLayout } from '../../../model/resolve';
import type { Background, DeviceElement, FamilyId, Fill, LangCode, Pattern } from '../../../model/types';
import { toast, useEditor, type EditorState } from '../../../store';
import { Badge, Button, ListRow, Switch, cx } from '../../kit';
import { useEditorUi } from '../editorUi';
import { BackgroundFields } from './BackgroundFields';
import { Hint, InspectorSection, LABEL_WIDTH, Row, StatusDot, type DotTone } from './controls';
import { FontPicker } from './FontPicker';
import { FRAME_LABEL, fontLabel, shotStatus, type ShotStatus } from './format';
import { PaletteEditor } from './PaletteEditor';
import { refreshFonts, slideById, useEditorDeep, usePalette } from './state';

export interface SlidePanelProps {
  slideId: string;
  family: FamilyId;
}

export const SlidePanel = memo(function SlidePanel({ slideId, family }: SlidePanelProps) {
  const palette = usePalette();
  return (
    <>
      <SlideSection slideId={slideId} family={family} palette={palette} />
      <ScreenshotsSection slideId={slideId} family={family} />
      <ThemeSection palette={palette} />
      <InspectorSection id="theme.palette" title="Palette">
        <PaletteEditor palette={palette} />
        <Hint>Offered first in every colour picker. Mock screens use the first colour as their accent.</Hint>
      </InspectorSection>
      <FontsSection />
      <ProjectSection />
    </>
  );
});

/* Slide ----------------------------------------------------------------------- */

const SlideSection = memo(function SlideSection({ slideId, family, palette }: { slideId: string; family: FamilyId; palette: readonly string[] }) {
  const select = useCallback(
    (s: EditorState) => {
      const slide = slideById(s.project, slideId);
      return slide && s.project ? resolveLayout(s.project, slide, family).background : null;
    },
    [slideId, family],
  );
  const own = useEditorDeep(select);
  const familyCount = useEditor((s) => s.project?.families.length ?? 1);
  const primary = useEditor((s) => s.project?.families[0] ?? family);
  const customLayout = useEditor((s) => family !== primary && !!slideById(s.project, slideId)?.layouts[family]);

  const followTheme = (on: boolean) => {
    const s = useEditor.getState();
    if (!s.project) return;
    s.setSlideBackground(slideId, family, on ? null : deepClone(s.project.theme.background));
  };

  /** The slide's own background as the store has it now. */
  const current = useCallback((): Background | null => {
    const s = useEditor.getState();
    const slide = slideById(s.project, slideId);
    return slide && s.project ? resolveLayout(s.project, slide, family).background : null;
  }, [slideId, family]);

  const applyFill = useCallback(
    (fill: Fill) => {
      const bg = current();
      if (bg) useEditor.getState().setSlideBackground(slideId, family, { ...bg, fill });
    },
    [current, slideId, family],
  );
  const updatePattern = useCallback(
    (fn: (p: Pattern | null) => Pattern | null) => {
      const bg = current();
      if (bg) useEditor.getState().setSlideBackground(slideId, family, { ...bg, pattern: fn(bg.pattern) });
    },
    [current, slideId, family],
  );

  return (
    <InspectorSection id="slide.background" title="Slide">
      <div className="flex min-h-7 items-center justify-between gap-2">
        <Switch label="Use theme background" checked={own === null} onCheckedChange={followTheme} />
      </div>
      {own && familyCount > 1 && <Hint>Applies to this slide’s {FAMILIES[family].label} layout.</Hint>}
      {own && <BackgroundFields scope={`slide:${slideId}:${family}`} value={own} applyFill={applyFill} read={current} updatePattern={updatePattern} palette={palette} />}
      {customLayout && (
        <div className="mt-1 flex items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-2 light:bg-raised">
          <LayoutTemplate aria-hidden className="size-3.5 shrink-0 text-text-3" />
          <p className="min-w-0 flex-1 text-xs leading-4 text-text-2">
            Own {FAMILIES[family].shortLabel} layout, independent of {FAMILIES[primary].shortLabel}.
          </p>
          <Button
            size="sm"
            variant="ghost"
            leadingIcon={<RotateCcw />}
            title={`Follow the ${FAMILIES[primary].label} layout instead`}
            onClick={() => {
              if (useEditor.getState().resetLayout(slideId, family)) toastWithUndo('Layout reset', `It now follows the ${FAMILIES[primary].label} layout.`);
            }}
          >
            Reset
          </Button>
        </div>
      )}
    </InspectorSection>
  );
});

/* Screenshots ----------------------------------------------------------------- */

interface ShotRow {
  device: { id: string; label: string };
  langs: { code: LangCode; status: ShotStatus }[];
}

// Same tones as the rest of the editor: a missing screenshot (a mock screen shows) needs
// attention, a fallback to the base language is fine as it is.
const STATUS: Record<ShotStatus, { tone: DotTone; label: (base: string) => string }> = {
  own: { tone: 'success', label: () => 'Added' },
  base: { tone: 'muted', label: (base) => `Uses ${base}` },
  missing: { tone: 'warning', label: () => 'Missing' },
};

const ScreenshotsSection = memo(function ScreenshotsSection({ slideId, family }: { slideId: string; family: FamilyId }) {
  const select = useCallback(
    (s: EditorState): ShotRow[] => {
      const p = s.project;
      const slide = slideById(p, slideId);
      if (!p || !slide) return [];
      const base = p.languages[0];
      const devices = resolveLayout(p, slide, family).elements.filter((e): e is DeviceElement => e.kind === 'device');
      return devices.map((d, i) => ({
        device: { id: d.id, label: d.name?.trim() || (devices.length > 1 ? `${FRAME_LABEL[d.frame]} ${i + 1}` : FRAME_LABEL[d.frame]) },
        langs: p.languages.map((code) => ({ code, status: shotStatus(slide, family, d.slot, code, base) })),
      }));
    },
    [slideId, family],
  );
  const rows = useEditorDeep(select);
  const base = useEditor((s) => s.project?.languages[0] ?? 'en-US');
  const activeLang = useEditor((s) => s.activeLang);

  const open = (deviceId: string, lang: LangCode) => {
    const s = useEditor.getState();
    s.setActiveLang(lang);
    s.select(deviceId, slideId);
  };

  return (
    <InspectorSection id="slide.shots" title="Screenshots">
      {rows.length === 0 ? (
        <Hint icon={<MonitorSmartphone />}>No device on this slide. Add one to show a screenshot.</Hint>
      ) : (
        rows.map((row) => (
          <div key={row.device.id} className="flex flex-col gap-0.5">
            {rows.length > 1 && <p className="px-1.5 pt-1 pb-0.5 text-2xs font-medium text-text-3">{row.device.label}</p>}
            <div role="listbox" aria-label={`${row.device.label} screenshots by language`} className="-mx-1.5 flex flex-col gap-px">
              {row.langs.map(({ code, status }) => {
                const info = languageInfo(code);
                return (
                  <ListRow
                    key={code}
                    label={
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate">{info.name}</span>
                        {code === base && row.langs.length > 1 && (
                          <Badge size="sm" className="shrink-0">
                            Base
                          </Badge>
                        )}
                      </span>
                    }
                    icon={<StatusDot tone={STATUS[status].tone} className="mx-[3px]" />}
                    meta={STATUS[status].label(languageInfo(base).name)}
                    selected={false}
                    aria-current={code === activeLang || undefined}
                    className={cx(code === activeLang && 'bg-surface-2')}
                    title={`Show the ${info.name} screenshot`}
                    onSelect={() => open(row.device.id, code)}
                  />
                );
              })}
            </div>
          </div>
        ))
      )}
    </InspectorSection>
  );
});

/* Theme ----------------------------------------------------------------------- */

function currentTheme() {
  return useEditor.getState().project?.theme ?? null;
}

function readThemeBackground(): Background | null {
  return currentTheme()?.background ?? null;
}

const ThemeSection = memo(function ThemeSection({ palette }: { palette: readonly string[] }) {
  const background = useEditor((s) => s.project?.theme.background ?? null);
  const panorama = useEditor((s) => s.project?.theme.panorama ?? false);
  const mockDark = useEditor((s) => s.project?.theme.mockDark ?? false);
  const slideCount = useEditor((s) => s.project?.slides.length ?? 1);

  const applyFill = useCallback((fill: Fill) => {
    const t = currentTheme();
    if (t) useEditor.getState().setThemeBackground({ ...t.background, fill });
  }, []);
  const updatePattern = useCallback((fn: (p: Pattern | null) => Pattern | null) => {
    const t = currentTheme();
    if (t) useEditor.getState().setThemeBackground({ ...t.background, pattern: fn(t.background.pattern) });
  }, []);

  if (!background) return null;
  return (
    <InspectorSection id="theme.background" title="Theme">
      <BackgroundFields scope="theme" value={background} applyFill={applyFill} read={readThemeBackground} updatePattern={updatePattern} palette={palette} />
      <div className="mt-1 flex flex-col gap-1">
        <Switch label="Panorama" checked={panorama} onCheckedChange={(on) => useEditor.getState().setPanorama(on)} />
        <Hint className="pl-9">
          {slideCount > 1 ? `One background flows across all ${slideCount} slides, like a single wide picture.` : 'One background flows across all slides, like a single wide picture.'}
        </Hint>
      </div>
      <div className="flex flex-col gap-1">
        <Switch label="Dark mock screens" checked={mockDark} onCheckedChange={(on) => useEditor.getState().setMockDark(on)} />
        <Hint className="pl-9">Placeholder app screens shown until a screenshot is added.</Hint>
      </div>
    </InspectorSection>
  );
});

/* Fonts ----------------------------------------------------------------------- */

const FontsSection = memo(function FontsSection() {
  const heading = useEditor((s) => s.project?.theme.fonts.heading ?? 'Inter Variable');
  const body = useEditor((s) => s.project?.theme.fonts.body ?? 'Inter Variable');
  const basis = `${heading}\u0000${body}`;
  // Picks wait for "Apply" (applying restyles every text); a theme change elsewhere (undo) drops them.
  const [draft, setDraft] = useState<{ basis: string; heading: string; body: string } | null>(null);
  const live = draft && draft.basis === basis ? draft : null;
  const h = live?.heading ?? heading;
  const b = live?.body ?? body;
  const changed = h !== heading || b !== body;

  const apply = () => {
    const s = useEditor.getState();
    if (!s.applyFonts(h, b)) {
      toast.info('Every text already uses these fonts');
      setDraft(null);
      return;
    }
    setDraft(null);
    refreshFonts();
    toastWithUndo('Fonts applied', `${fontLabel(h)} for headlines, ${fontLabel(b)} for everything else.`);
  };

  return (
    <InspectorSection id="theme.fonts" title="Fonts">
      <Row label="Heading">
        <FontPicker value={h} onChange={(f) => setDraft({ basis, heading: f, body: b })} />
      </Row>
      <Row label="Body">
        <FontPicker value={b} onChange={(f) => setDraft({ basis, heading: h, body: f })} />
      </Row>
      <div className="grid gap-x-2" style={{ gridTemplateColumns: `${LABEL_WIDTH}px minmax(0, 1fr)` }}>
        <Button size="sm" variant={changed ? 'primary' : 'secondary'} leadingIcon={<Type />} className="col-start-2 justify-self-start" onClick={apply}>
          Apply to all text
        </Button>
      </div>
    </InspectorSection>
  );
});

/** Success toast with an Undo action. */
function toastWithUndo(title: string, description: string): void {
  toast.push({ kind: 'success', title, description, action: { label: 'Undo', run: () => useEditor.getState().undo() } });
}

/* Project --------------------------------------------------------------------- */

const MAX_LANGUAGE_CHIPS = 10;

const ProjectSection = memo(function ProjectSection() {
  const familiesKey = useEditor((s) => s.project?.families.join(',') ?? '');
  const languagesKey = useEditor((s) => s.project?.languages.join(',') ?? '');
  const activeFamily = useEditor((s) => s.activeFamily);
  const activeLang = useEditor((s) => s.activeLang);
  const openDialog = useEditorUi((s) => s.openDialog);
  const families = useMemo(() => (familiesKey ? (familiesKey.split(',') as FamilyId[]) : []), [familiesKey]);
  const languages = useMemo(() => (languagesKey ? languagesKey.split(',') : []), [languagesKey]);
  const shown = languages.slice(0, MAX_LANGUAGE_CHIPS);
  const more = languages.length - shown.length;

  return (
    <InspectorSection id="project" title="Project" borderless>
      <ChipGroup label="Devices" manageLabel="Manage devices" onManage={() => openDialog('families')}>
          {families.map((f, i) => (
            <Chip key={f} active={f === activeFamily} title={i === 0 ? `${FAMILIES[f].label} (primary: other devices adapt its layouts)` : FAMILIES[f].label} onClick={() => useEditor.getState().setActiveFamily(f)}>
              {FAMILIES[f].shortLabel}
            </Chip>
          ))}
      </ChipGroup>
      <ChipGroup label="Languages" manageLabel="Manage languages" onManage={() => openDialog('languages')}>
          {shown.map((code, i) => {
            const info = languageInfo(code);
            return (
              <Chip key={code} active={code === activeLang} title={i === 0 ? `${info.name}: base language, used where a translation is missing` : info.name} onClick={() => useEditor.getState().setActiveLang(code)}>
                <span className="truncate">{info.name}</span>
                {i === 0 && languages.length > 1 && <span className="text-2xs font-normal opacity-70">Base</span>}
              </Chip>
            );
          })}
          {more > 0 && (
            <Chip active={false} title="Show every language" onClick={() => openDialog('languages')}>
              +{more} more
            </Chip>
          )}
      </ChipGroup>
      <Button size="sm" leadingIcon={<Languages />} onClick={() => openDialog('translations')} className="self-start">
        Translations…
      </Button>
    </InspectorSection>
  );
});

/** A labelled row of chips with a "Manage…" button. */
function ChipGroup({ label, manageLabel, onManage, children }: { label: string; manageLabel: string; onManage: () => void; children: ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-h-4 items-center justify-between gap-2">
        <span id={id} className="text-xs font-medium text-text-2">
          {label}
        </span>
        <Button size="sm" variant="ghost" leadingIcon={<Settings2 />} aria-label={manageLabel} onClick={onManage} className="-my-1 -mr-0.5">
          Manage…
        </Button>
      </div>
      <div role="group" aria-labelledby={id} className="flex flex-wrap gap-1">
        {children}
      </div>
    </div>
  );
}

function Chip({ active, title, onClick, children }: { active: boolean; title?: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'inline-flex h-6 max-w-full min-w-0 items-center gap-1.5 rounded-sm border px-2 text-xs font-medium outline-none',
        'transition-[background-color,border-color,color] duration-(--dur-fast) ease-out',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
        active ? 'border-accent-line bg-accent-soft text-accent-fg' : 'border-line bg-field text-text-2 hover:bg-field-hover hover:text-text',
      )}
    >
      {children}
    </button>
  );
}

