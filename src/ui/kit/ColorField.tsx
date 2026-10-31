import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from 'react';
import { HexAlphaColorPicker, HexColorPicker } from 'react-colorful';
import { Check, Pipette } from 'lucide-react';
import { cx, type ControlSize } from './cx';
import { useFieldControl } from './fieldContext';
import { useEscapeClaim, useLatest } from './hooks';
import { IconButton } from './IconButton';
import { FIELD_SHELL } from './Input';
import { NumberField } from './NumberField';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from './Popover';
import {
  addRecentColor,
  alphaToPercent,
  colorsEqual,
  getRecentColors,
  normalizeHex,
  parseCssColor,
  prefersDarkInk,
  splitAlpha,
  subscribeRecentColors,
  withAlpha,
} from './color';

import { t } from '../../i18n';
export interface ColorFieldProps {
  /** "#RRGGBB" or "#RRGGBBAA". */
  value: string;
  /** Live updates while picking. */
  onChange: (value: string) => void;
  /** Once per finished interaction (pointer up, Enter, a swatch, the eyedropper, closing the picker). */
  onCommit?: (value: string) => void;
  /** Offer an alpha channel (default true). */
  alpha?: boolean;
  /** Swatches offered first, usually the theme palette. */
  palette?: readonly string[];
  /** Show the hex (and alpha) inputs next to the swatch (default true); false renders a swatch button only. */
  showInput?: boolean;
  /** Accessible name, e.g. "Text colour". */
  label?: string;
  size?: ControlSize;
  disabled?: boolean;
  id?: string;
  className?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
}

interface EyeDropperInstance {
  open(options?: { signal?: AbortSignal }): Promise<{ sRGBHex: string }>;
}
type EyeDropperConstructor = new () => EyeDropperInstance;

function eyeDropper(): EyeDropperConstructor | null {
  if (typeof window === 'undefined') return null;
  const ctor = (window as unknown as { EyeDropper?: unknown }).EyeDropper;
  return typeof ctor === 'function' ? (ctor as EyeDropperConstructor) : null;
}

const SWATCH_SIZES: Record<ControlSize, string> = {
  sm: 'size-6 rounded-sm',
  md: 'size-7 rounded-sm',
  lg: 'size-9 rounded-md',
};

const SHELL_SIZES: Record<ControlSize, string> = {
  sm: 'h-6 gap-1 rounded-sm pl-[3px] pr-1.5 text-xs',
  md: 'h-7 gap-1.5 rounded-sm pl-1 pr-2 text-xs',
  lg: 'h-9 gap-2 rounded-md pl-1.5 pr-3 text-ui',
};

/** Colour preview over the transparency checkerboard. */
function ColorChip({ color, className }: { color: string; className?: string }) {
  return (
    <span className={cx('kit-checker relative block overflow-hidden', className)}>
      <span className="absolute inset-0" style={{ background: color }} />
      <span className="absolute inset-0 rounded-[inherit] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)]" />
    </span>
  );
}

/** Colour control: swatch + hex/alpha inputs, opening a picker with palette, recent colours and an eyedropper. */
export const ColorField = forwardRef<HTMLButtonElement, ColorFieldProps>(function ColorField(
  {
    value,
    onChange,
    onCommit,
    alpha = true,
    palette = [],
    showInput = true,
    label,
    size = 'md',
    disabled = false,
    className,
    side = 'bottom',
    align = 'start',
    ...props
  },
  ref,
) {
  const field = useFieldControl({ id: props.id });
  const [open, setOpen] = useState(false);
  const current = normalizeHex(value, { alpha }) ?? '#000000';
  const { rgb, alpha: a } = splitAlpha(current);
  const hexText = rgb.slice(1);

  const latest = useRef(current);
  const dirty = useRef(false);
  // Every render, not only on change: a parent that ignored our last value must win back.
  useLayoutEffect(() => {
    if (!dirty.current) latest.current = current;
  });

  const onChangeRef = useRef(onChange);
  const onCommitRef = useRef(onCommit);
  useLayoutEffect(() => {
    onChangeRef.current = onChange;
    onCommitRef.current = onCommit;
  });

  /** Live change; ignores no-ops so pickers do not spam the history. */
  const emit = (next: string) => {
    const n = normalizeHex(next, { alpha });
    if (!n || colorsEqual(n, latest.current)) return;
    latest.current = n;
    dirty.current = true;
    onChangeRef.current(n);
  };

  /** Ends the interaction: commits once if anything changed since the last commit. */
  const commit = (next?: string) => {
    if (next !== undefined) emit(next);
    if (!dirty.current) return;
    dirty.current = false;
    addRecentColor(latest.current);
    onCommitRef.current?.(latest.current);
  };
  const commitRef = useRef(commit);
  useLayoutEffect(() => {
    commitRef.current = commit;
  });

  // An unmount mid-drag (selection changed) still closes the interaction.
  useEffect(() => () => commitRef.current(), []);

  const name = label ?? 'Colour';
  const swatchLabel = `${name}: #${hexText}${alpha && a < 1 ? `, ${alphaToPercent(a)}% opacity` : ''}`;

  const picker = (
    <PopoverContent
      side={side}
      align={align}
      width={248}
      className="kit-colorful flex flex-col gap-3"
      aria-label={t('{name} picker', { name })}
    >
      <ColorPickerPanel color={current} alpha={alpha} palette={palette} onLive={emit} onCommit={commit} />
    </PopoverContent>
  );

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) commit();
  };

  if (!showInput) {
    return (
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild disabled={disabled}>
          <button
            ref={ref}
            type="button"
            id={field.id}
            aria-label={swatchLabel}
            aria-describedby={field['aria-describedby']}
            className={cx(
              'group/swatch relative inline-flex shrink-0 items-center justify-center p-[3px] outline-none',
              'border border-line bg-field transition-colors duration-(--dur-fast) hover:border-line-strong hover:bg-field-hover light:bg-raised',
              'focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-1 focus-visible:outline-focus data-[state=open]:border-accent-line',
              'disabled:pointer-events-none disabled:opacity-45',
              SWATCH_SIZES[size],
              className,
            )}
          >
            <ColorChip color={current} className="size-full rounded-[3px]" />
          </button>
        </PopoverTrigger>
        {picker}
      </Popover>
    );
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <div
          data-disabled={disabled ? '' : undefined}
          className={cx(
            'flex min-w-0 items-center',
            FIELD_SHELL,
            SHELL_SIZES[size],
            open && 'border-accent-line bg-field-hover',
            field.invalid && 'border-danger! ring-3 ring-danger-soft',
            disabled && 'pointer-events-none opacity-50',
            className,
          )}
        >
          <PopoverTrigger asChild disabled={disabled}>
            <button
              ref={ref}
              type="button"
              aria-label={swatchLabel}
              className={cx(
                'shrink-0 rounded-[4px] outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-1 focus-visible:outline-focus',
                size === 'lg' ? 'size-6' : size === 'md' ? 'size-5' : 'size-[18px]',
              )}
            >
              <ColorChip color={current} className="size-full rounded-[4px]" />
            </button>
          </PopoverTrigger>
          <HexInput
            id={field.id}
            ariaLabel={label ? `${label} hex` : field.id ? undefined : 'Hex colour'}
            describedBy={field['aria-describedby']}
            hex={hexText}
            disabled={disabled}
            onCommitHex={(typed) => commit(typed.length === 7 ? withAlpha(typed, a) : typed)}
            className="min-w-0 flex-1"
          />
          {alpha && (
            <>
              <span aria-hidden className="h-3.5 w-px shrink-0 bg-line" />
              <NumberField
                variant="bare"
                aria-label={t('{name} opacity', { name })}
                value={alphaToPercent(a)}
                min={0}
                max={100}
                step={1}
                unit="%"
                disabled={disabled}
                onChange={(pct) => emit(withAlpha(latest.current, pct / 100))}
                onCommit={() => commit()}
                className="w-[42px] shrink-0"
                inputClassName="text-right"
              />
            </>
          )}
        </div>
      </PopoverAnchor>
      {picker}
    </Popover>
  );
});

interface HexInputProps {
  hex: string;
  onCommitHex: (hex: string) => void;
  id?: string;
  ariaLabel?: string;
  describedBy?: string;
  disabled?: boolean;
  className?: string;
}

/** Hex text input: edits freely, validates on Enter/blur, reverts invalid text. */
function HexInput({ hex, onCommitHex, id, ariaLabel, describedBy, disabled, className }: HexInputProps) {
  const [draft, setDraftState] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // The typed text, readable from the unmount cleanup below (which only sees the first render's state).
  const pending = useRef<string | null>(null);
  const setDraft = (text: string | null) => {
    pending.current = text;
    setDraftState(text);
  };
  const commitHexRef = useLatest(onCommitHex);
  useEscapeClaim(draft !== null, inputRef);

  // Unmounting with a valid colour typed (the selection changed, the picker closed) keeps it, as leaving the field would.
  useEffect(
    () => () => {
      const n = pending.current === null ? null : normalizeHex(pending.current);
      pending.current = null;
      if (n) commitHexRef.current(n);
    },
    [commitHexRef],
  );

  const commit = () => {
    if (draft === null) return;
    const n = normalizeHex(draft);
    setDraft(null);
    if (!n) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onCommitHex(n);
  };

  useEffect(() => {
    if (!invalid) return;
    const t = setTimeout(() => setInvalid(false), 900);
    return () => clearTimeout(t);
  }, [invalid]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
      e.currentTarget.select();
    } else if (e.key === 'Escape' && draft !== null) {
      e.preventDefault();
      e.stopPropagation();
      setDraft(null);
    }
  };

  return (
    <input
      ref={inputRef}
      id={id}
      type="text"
      dir="ltr"
      spellCheck={false}
      autoComplete="off"
      maxLength={9}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      value={draft ?? hex}
      onChange={(e) => {
        setInvalid(false);
        setDraft(e.target.value);
      }}
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={onKeyDown}
      onBlur={commit}
      onPaste={(e) => {
        // Pasted rgb()/hsl-free CSS colours are converted on the spot.
        const text = e.clipboardData.getData('text');
        const parsed = parseCssColor(text);
        if (parsed && !normalizeHex(text)) {
          e.preventDefault();
          setDraft(null);
          onCommitHex(parsed);
        }
      }}
      className={cx(
        'h-full bg-transparent font-medium tabular-nums uppercase outline-none placeholder:text-text-3',
        'transition-colors duration-(--dur-fast)',
        invalid && 'text-danger',
        className,
      )}
    />
  );
}

export interface ColorPickerPanelProps {
  color: string;
  alpha: boolean;
  palette: readonly string[];
  onLive: (color: string) => void;
  onCommit: (color?: string) => void;
  inputId?: string;
}

/** The picker body (saturation, hue, alpha, inputs, swatches); also usable inline. */
export function ColorPickerPanel({ color, alpha, palette, onLive, onCommit, inputId }: ColorPickerPanelProps) {
  const recent = useSyncExternalStore(subscribeRecentColors, getRecentColors, getRecentColors);
  const { rgb, alpha: a } = splitAlpha(color);
  const Dropper = eyeDropper();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const pickFromScreen = async () => {
    if (!Dropper) return;
    try {
      const result = await new Dropper().open();
      const picked = parseCssColor(result.sRGBHex);
      if (picked && mounted.current) onCommit(alpha ? withAlpha(picked, a) : picked);
    } catch {
      // Escape or a lost focus cancels the eyedropper; nothing to do.
    }
  };

  const Picker = alpha ? HexAlphaColorPicker : HexColorPicker;
  const paletteColors = dedupe(palette);
  const recentColors = recent.filter((c) => !paletteColors.some((p) => colorsEqual(p, c))).slice(0, 8);

  return (
    <>
      <div
        // react-colorful reports the end of a drag; keyboard nudges commit on key release.
        onKeyUp={(e) => {
          if (e.key.startsWith('Arrow')) onCommit();
        }}
      >
        <Picker color={alpha ? color : rgb} onChange={onLive} onChangeEnd={() => onCommit()} />
      </div>
      <div className="flex items-center gap-1.5">
        {Dropper && <IconButton label={t('Pick a colour from the screen')} variant="solid" size="md" icon={<Pipette />} onClick={pickFromScreen} />}
        <div className={cx('flex h-7 min-w-0 flex-1 items-center gap-1 rounded-sm px-2 text-xs', FIELD_SHELL)}>
          <span aria-hidden className="text-text-3 select-none">
            #
          </span>
          <HexInput
            id={inputId}
            ariaLabel="Hex colour"
            hex={rgb.slice(1)}
            onCommitHex={(typed) => onCommit(alpha && typed.length === 7 ? withAlpha(typed, a) : typed)}
            className="min-w-0 flex-1"
          />
        </div>
        {alpha && (
          <NumberField
            aria-label={t('Opacity')}
            value={alphaToPercent(a)}
            min={0}
            max={100}
            step={1}
            unit="%"
            onChange={(pct) => onLive(withAlpha(color, pct / 100))}
            onCommit={() => onCommit()}
            className="w-[64px] shrink-0"
          />
        )}
      </div>
      {paletteColors.length > 0 && <SwatchGroup title={t('Theme')} colors={paletteColors} value={color} onPick={(c) => onCommit(alpha ? c : splitAlpha(c).rgb)} />}
      {recentColors.length > 0 && <SwatchGroup title={t('Recent')} colors={recentColors} value={color} onPick={(c) => onCommit(alpha ? c : splitAlpha(c).rgb)} />}
    </>
  );
}

function dedupe(colors: readonly string[]): string[] {
  const out: string[] = [];
  for (const c of colors) {
    const n = normalizeHex(c);
    if (n && !out.includes(n)) out.push(n);
  }
  return out.slice(0, 16);
}

function SwatchGroup({ title, colors, value, onPick }: { title: string; colors: readonly string[]; value: string; onPick: (color: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-2xs font-medium text-text-3">{title}</div>
      <div role="group" aria-label={t('{title} colours', { title })} className="grid grid-cols-8 gap-1.5">
        {colors.map((c) => {
          const selected = colorsEqual(c, value);
          return (
            <button
              key={c}
              type="button"
              title={c}
              aria-label={`${c}${selected ? ' (current)' : ''}`}
              aria-pressed={selected}
              onClick={() => onPick(c)}
              className={cx(
                'relative size-[22px] rounded-[5px] outline-none transition-transform duration-(--dur-fast) ease-out hover:scale-110',
                'focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-1 focus-visible:outline-focus',
                selected && 'ring-2 ring-accent ring-offset-1 ring-offset-popover',
              )}
            >
              <ColorChip color={c} className="size-full rounded-[5px]" />
              {selected && (
                <Check
                  aria-hidden
                  strokeWidth={3}
                  className={cx('absolute inset-0 m-auto size-3', prefersDarkInk(c) ? 'text-[rgba(0,0,0,0.72)]' : 'text-white')}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { ColorChip };
