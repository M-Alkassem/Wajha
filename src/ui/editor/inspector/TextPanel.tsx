/**
 * Text element panel: the copy in the active language, typography,
 * colours, shadow. Texts are per language (shared by every device family);
 * a language without its own text shows the base language's as a hint.
 */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore, type KeyboardEvent } from 'react';
import {
  ALargeSmall,
  ArrowDownFromLine,
  ArrowUpFromLine,
  CaseUpper,
  Highlighter,
  Languages,
  LetterSpacing,
  LineHeight,
  Rows3,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignStart,
  TriangleAlert,
  UnfoldVertical,
} from 'lucide-react';
import { isRtl } from '../../../model/catalog';
import { LIMITS } from '../../../model/rules';
import type { TextElement, TextStyle } from '../../../model/types';
import { useEditor } from '../../../store';
import { Button, ColorField, IconButton, NumberField, SegmentedControl, Select, Textarea, matchShortcut, platformIsMac, type SegmentedOption } from '../../kit';
import { useEditorUi } from '../editorUi';
import { getSnapshot, subscribeSnapshot } from '../stage/stageStore';
import { FontPicker } from './FontPicker';
import { InspectorSection, Pair, Row } from './controls';
import { clampWeight, fromPct, languageLabel, smallerTextSize, toPct, weightOptions, weightRange } from './format';
import { toggleHighlight } from './highlight';
import { LayoutSection } from './LayoutSection';
import { useLive } from './live';
import { ShadowSection } from './ShadowSection';
import { patchTarget, refreshFonts, slideById, usePalette, type Target } from './state';

import { t } from '../../../i18n';
import { tx } from '../../../i18n/react';
const TEXT_SHADOW = { color: '#00000059', blur: 0.012, x: 0, y: 0.004 };
const HIGHLIGHT_SHORTCUT = 'mod+b';
/** Pause in typing after which missing font subsets are requested. */
const FONT_REFRESH_MS = 500;

export interface TextPanelProps {
  el: TextElement;
  target: Target;
  index: number;
  count: number;
}

export const TextPanel = memo(function TextPanel({ el, target, index, count }: TextPanelProps) {
  const palette = usePalette();
  return (
    <>
      <TextContent target={target} textKey={el.key} maxLines={el.style.maxLines} size={el.style.size} />
      <TypographySection style={el.style} target={target} />
      <ColourSection style={el.style} target={target} palette={palette} />
      <ShadowSection id="text.shadow" el={el} target={target} defaultShadow={TEXT_SHADOW} palette={palette} />
      <LayoutSection el={el} target={target} index={index} count={count}>
        <TextBoxRow el={el} target={target} />
      </LayoutSection>
    </>
  );
});

/* Copy -------------------------------------------------------------------- */

/** The pending request to focus this element's text field, if any (its nonce). */
function useFocusRequest(elementId: string): number | null {
  return useEditorUi((s) => (s.textFocus?.elementId === elementId ? s.textFocus.nonce : null));
}

interface TextContentProps {
  target: Target;
  textKey: string;
  maxLines: number;
  size: number;
}

const TextContent = memo(function TextContent({ target, textKey, maxLines, size }: TextContentProps) {
  // A focus request opens the section first; the field takes the request once it is mounted.
  const signal = useFocusRequest(target.elementId);
  return (
    <InspectorSection id="text.content" title={t('Text')} openSignal={signal}>
      <TextField target={target} textKey={textKey} maxLines={maxLines} size={size} />
    </InspectorSection>
  );
});

function TextField({ target, textKey, maxLines, size }: TextContentProps) {
  const { slideId, elementId } = target;
  const lang = useEditor((s) => s.activeLang);
  const base = useEditor((s) => s.project?.languages[0] ?? s.activeLang);
  const own = useEditor((s) => slideById(s.project, slideId)?.texts[lang]?.[textKey]);
  const baseText = useEditor((s) => slideById(s.project, slideId)?.texts[base]?.[textKey] ?? '');
  const ref = useRef<HTMLTextAreaElement>(null);
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);
  const value = own ?? '';
  const rtl = isRtl(lang);
  const usingBase = lang !== base && value === '' && baseText !== '';

  const write = useCallback((text: string) => useEditor.getState().setText(slideId, textKey, lang, text), [slideId, textKey, lang]);

  // Double-clicking text on the canvas (or adding a text layer) asks for this field: focus it and select everything.
  const focusRequest = useFocusRequest(elementId);
  useEffect(() => {
    if (focusRequest === null) return;
    useEditorUi.getState().takeTextFocus(focusRequest);
    const ta = ref.current;
    if (!ta) return;
    ta.focus();
    ta.select();
  }, [focusRequest]);

  useLayoutEffect(() => {
    const sel = pendingSelection.current;
    const ta = ref.current;
    if (!sel || !ta) return;
    pendingSelection.current = null;
    ta.focus();
    ta.setSelectionRange(sel.start, sel.end);
  }, [value]);

  // New characters may need font subsets that are not loaded yet (a first Arabic or
  // Cyrillic word): ask for them once typing pauses, so the canvas repaints in the right face.
  const typedOnce = useRef(false);
  useEffect(() => {
    if (!typedOnce.current) {
      typedOnce.current = true;
      return;
    }
    const t = setTimeout(refreshFonts, FONT_REFRESH_MS);
    return () => clearTimeout(t);
  }, [value]);

  const highlight = () => {
    const ta = ref.current;
    if (!ta) return;
    const next = toggleHighlight(ta.value, ta.selectionStart ?? ta.value.length, ta.selectionEnd ?? ta.value.length);
    if (next.text === ta.value) {
      ta.focus();
      ta.setSelectionRange(next.start, next.end);
      return;
    }
    pendingSelection.current = { start: next.start, end: next.end };
    if (!write(next.text)) pendingSelection.current = null;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (matchShortcut(e, HIGHLIGHT_SHORTCUT, platformIsMac())) {
      e.preventDefault();
      highlight();
    }
  };

  const placeholder = usingBase ? baseText : lang === base ? `Type the ${textKey === 'headline' ? 'headline' : 'text'}…` : `Type the ${languageLabel(lang)} text…`;
  // An empty field shows the base language's text as its placeholder: lay it out in that
  // language's direction so its punctuation stays put, then switch as soon as typing starts.
  const dir = value === '' && usingBase ? (isRtl(base) ? 'rtl' : 'ltr') : rtl ? 'rtl' : 'auto';

  return (
    <>
      <Textarea
        ref={ref}
        aria-label={t('Text in {languageLabel}', { languageLabel: languageLabel(lang) })}
        value={value}
        placeholder={placeholder}
        dir={dir}
        lang={lang}
        autoGrow
        minRows={2}
        maxRows={12}
        maxLength={LIMITS.text}
        spellCheck
        onChange={(e) => write(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <OverflowNote target={target} maxLines={maxLines} size={size} />
      {usingBase && (
        <p className="flex items-center gap-1.5 text-xs leading-4 text-text-3">
          <Languages aria-hidden className="size-3.5 shrink-0" />
          <span className="min-w-0 truncate">
            {tx('Using {languageLabel} text · type to translate', { languageLabel: languageLabel(base) })}
          </span>
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 text-xs leading-4 text-text-3">
          {t('Wrap words in')} <span className="font-medium text-text-2">{t('*asterisks*')}</span> {t('to highlight')}
        </p>
        <IconButton
          size="sm"
          variant="solid"
          label={t('Highlight selected words')}
          shortcut={HIGHLIGHT_SHORTCUT}
          icon={<Highlighter />}
          onMouseDown={(e) => e.preventDefault()}
          onClick={highlight}
        />
      </div>
    </>
  );
}

/** True while the stage's latest paint of the slide has this text overflowing its line limit. */
function useOverflowing({ slideId, family, elementId }: Target): boolean {
  const subscribe = useCallback((onChange: () => void) => subscribeSnapshot(slideId, onChange), [slideId]);
  const read = () => {
    const snapshot = getSnapshot(slideId);
    return !!snapshot && snapshot.family === family && snapshot.result.overflowingText.includes(elementId);
  };
  // The snapshot store is a plain module, so server rendering (the panel tests) reads it too.
  return useSyncExternalStore(subscribe, read, read);
}

/**
 * Warns while the text needs more lines than its limit even at the smallest
 * auto-fit size (60%), so it spills past its box, and offers the two fixes.
 */
function OverflowNote({ target, maxLines, size }: { target: Target; maxLines: number; size: number }) {
  const overflowing = useOverflowing(target);
  if (!overflowing || maxLines <= 0) return null;
  const more = maxLines + 1;
  return (
    <div role="status" className="flex flex-col gap-2 rounded-md border border-warning-soft bg-warning-soft px-2.5 py-2 text-xs leading-4 text-text">
      <p className="flex items-start gap-1.5">
        <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0 text-warning" />
        <span className="min-w-0 text-balance">
          {t('Too long for')} {maxLines === 1 ? t('one line') : t('{maxLines} lines', { maxLines })}{t(', even shrunk to 60%.')}
        </span>
      </p>
      <div className="flex flex-wrap gap-1.5 pl-5">
        <Button size="sm" onClick={() => patchTarget(target, { style: { maxLines: more } })}>
          {tx('Allow {more} lines', { more })}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => patchTarget(target, { style: { size: smallerTextSize(size) } })}>
          {t('Smaller text')}
        </Button>
      </div>
    </div>
  );
}

/* Typography ---------------------------------------------------------------- */

const TypographySection = memo(function TypographySection({ style, target }: { style: TextStyle; target: Target }) {
  const lang = useEditor((s) => s.activeLang);
  const rtl = isRtl(lang);
  const size = useLive<number>((v) => patchTarget(target, { style: { size: fromPct(v) } }));
  const lineHeight = useLive<number>((v) => patchTarget(target, { style: { lineHeight: v } }));
  const letterSpacing = useLive<number>((v) => patchTarget(target, { style: { letterSpacing: v } }));
  const maxLines = useLive<number>((v) => patchTarget(target, { style: { maxLines: Math.max(0, Math.round(v)) } }));

  const weights = useMemo(() => weightOptions(weightRange(style.font), style.weight), [style.font, style.weight]);

  const alignOptions = useMemo<SegmentedOption<TextStyle['align']>[]>(() => {
    // Visual order is always left, centre, right; in right-to-left languages "start" is the right edge.
    const left: SegmentedOption<TextStyle['align']> = { value: rtl ? 'end' : 'start', icon: <TextAlignStart />, tooltip: rtl ? t('Align left (end)') : t('Align left (start)') };
    const right: SegmentedOption<TextStyle['align']> = { value: rtl ? 'start' : 'end', icon: <TextAlignEnd />, tooltip: rtl ? t('Align right (start)') : t('Align right (end)') };
    return [left, { value: 'center', icon: <TextAlignCenter />, tooltip: t('Align centre') }, right];
  }, [rtl]);

  return (
    <InspectorSection id="text.type" title={t('Typography')}>
      <FontPicker
        aria-label={t('Font')}
        value={style.font}
        onChange={(font) => {
          if (patchTarget(target, { style: { font, weight: clampWeight(style.weight, weightRange(font)) } })) refreshFonts();
        }}
      />
      <Pair>
        <Select
          aria-label={t('Weight')}
          value={String(Math.round(style.weight))}
          options={weights}
          onValueChange={(v) => {
            if (patchTarget(target, { style: { weight: Number(v) } })) refreshFonts();
          }}
        />
        <NumberField
          label={<ALargeSmall />}
          labelTitle="Font size, % of the shorter canvas side"
          aria-label={t('Font size')}
          value={toPct(style.size)}
          min={0.4}
          max={100}
          step={0.1}
          precision={2}
          unit="%"
          {...size}
        />
      </Pair>
      <Pair>
        <NumberField
          label={<LineHeight />}
          labelTitle="Line height, times the font size"
          aria-label={t('Line height')}
          value={style.lineHeight}
          min={0.5}
          max={4}
          step={0.01}
          precision={2}
          {...lineHeight}
        />
        <NumberField
          label={<LetterSpacing />}
          labelTitle="Letter spacing, em (not applied to Arabic and other joined scripts)"
          aria-label={t('Letter spacing')}
          value={style.letterSpacing}
          min={-0.5}
          max={2}
          step={0.01}
          precision={3}
          unit="em"
          {...letterSpacing}
        />
      </Pair>
      <Pair>
        <div className="flex min-w-0 items-center gap-1">
          <SegmentedControl<TextStyle['align']>
            aria-label={t('Alignment')}
            value={style.align}
            options={alignOptions}
            onValueChange={(align) => patchTarget(target, { style: { align } })}
          />
          <IconButton
            label={t('Uppercase')}
            icon={<CaseUpper />}
            active={style.transform === 'uppercase'}
            onClick={() => patchTarget(target, { style: { transform: style.transform === 'uppercase' ? 'none' : 'uppercase' } })}
          />
        </div>
        <NumberField
          label={<Rows3 />}
          labelTitle="Maximum lines; longer text shrinks to fit (empty = no limit)"
          aria-label={t('Maximum lines')}
          value={style.maxLines > 0 ? style.maxLines : Number.NaN}
          unit={style.maxLines === 1 ? 'line' : style.maxLines > 1 ? 'lines' : undefined}
          placeholder={t('No limit')}
          min={0}
          max={50}
          step={1}
          precision={0}
          emptyValue={0}
          {...maxLines}
        />
      </Pair>
    </InspectorSection>
  );
});

/* Colours -------------------------------------------------------------------- */

const ColourSection = memo(function ColourSection({ style, target, palette }: { style: TextStyle; target: Target; palette: readonly string[] }) {
  const color = useLive<string>((c) => patchTarget(target, { style: { color: c } }));
  const highlight = useLive<string>((c) => patchTarget(target, { style: { highlight: c } }));
  return (
    <InspectorSection id="text.colour" title={t('Colour')}>
      <Row label={t('Text')}>
        <ColorField label={t('Text colour')} value={style.color} palette={palette} {...color} />
      </Row>
      <Row label={t('Highlight')}>
        <ColorField label={t('Highlight colour')} value={style.highlight} palette={palette} {...highlight} />
      </Row>
      <Row label={t('Style')}>
        <SegmentedControl<TextStyle['highlightMode']>
          fullWidth
          value={style.highlightMode}
          options={[
            { value: 'color', label: t('Colour'), tooltip: t('Highlighted words take the highlight colour') },
            { value: 'marker', label: t('Marker'), tooltip: t('A rounded marker is painted behind highlighted words') },
          ]}
          onValueChange={(highlightMode) => patchTarget(target, { style: { highlightMode } })}
        />
      </Row>
    </InspectorSection>
  );
});

/* Box (inside Layout) ------------------------------------------------------------ */

const ANCHORS: SegmentedOption<TextElement['valign']>[] = [
  { value: 'top', icon: <ArrowDownFromLine />, tooltip: t('Anchor top: the text grows downward') },
  { value: 'middle', icon: <UnfoldVertical />, tooltip: t('Anchor middle: the text grows both ways') },
  { value: 'bottom', icon: <ArrowUpFromLine />, tooltip: t('Anchor bottom: the text grows upward') },
];

const TextBoxRow = memo(function TextBoxRow({ el, target }: { el: TextElement; target: Target }) {
  const width = useLive<number>((v) => patchTarget(target, { width: fromPct(v) }));
  return (
    <Row label={t('Text box')}>
      <Pair>
        <NumberField label={t('W')} labelTitle="Box width, % of the shorter canvas side" value={toPct(el.width)} min={2} max={600} step={0.5} precision={2} unit="%" {...width} />
        <SegmentedControl<TextElement['valign']>
          aria-label={t('Vertical anchor')}
          fullWidth
          value={el.valign}
          options={ANCHORS}
          onValueChange={(valign) => patchTarget(target, { valign })}
        />
      </Pair>
    </Row>
  );
});
