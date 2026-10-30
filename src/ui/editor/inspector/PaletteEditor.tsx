/**
 * Theme palette editor: a row of swatches (click to edit, hover or Delete
 * to remove) and an add button that appends a fitting colour and opens its
 * picker straight away. At most eight colours.
 */
import { memo, useState, type KeyboardEvent } from 'react';
import { Plus, X } from 'lucide-react';
import { useEditor } from '../../../store';
import { ColorChip, ColorPickerPanel, Popover, PopoverContent, PopoverTrigger, Tooltip, cx } from '../../kit';
import { suggestPaletteColor } from './format';
import { useLive } from './live';

export const PALETTE_MAX = 8;

interface SwatchEdit {
  index: number;
  color: string;
}

/** Replaces one colour of the palette as the store has it now. */
function writeSwatch({ index, color }: SwatchEdit): void {
  const s = useEditor.getState();
  const current = s.project?.theme.palette ?? [];
  if (index < 0 || index >= current.length) return;
  const next = current.slice();
  next[index] = color;
  s.setPalette(next);
}

export const PaletteEditor = memo(function PaletteEditor({ palette }: { palette: readonly string[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const live = useLive<SwatchEdit>(writeSwatch);

  const remove = (index: number) => {
    const s = useEditor.getState();
    const current = s.project?.theme.palette ?? [];
    s.setPalette(current.filter((_, i) => i !== index));
    setOpen(null);
  };

  const add = () => {
    const s = useEditor.getState();
    const current = s.project?.theme.palette ?? [];
    if (current.length >= PALETTE_MAX) return;
    if (s.setPalette([...current, suggestPaletteColor(current)])) setOpen(current.length);
  };

  const onSwatchKey = (index: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      remove(index);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Theme palette">
      {palette.map((color, i) => (
        // Keyed by position: a key that followed the colour would remount (and close) the picker while dragging.
        <div key={i} className="group/swatch relative">
          <Popover
            open={open === i}
            onOpenChange={(next) => {
              setOpen(next ? i : null);
              if (!next) live.onCommit();
            }}
          >
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={`Palette colour ${i + 1}: ${color}. Delete removes it`}
                onKeyDown={onSwatchKey(i)}
                className={cx(
                  'block size-[26px] rounded-[7px] p-[3px] outline-none transition-[box-shadow,background-color] duration-(--dur-fast)',
                  'border border-line bg-field hover:border-line-strong light:bg-raised',
                  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus data-[state=open]:border-accent-line',
                )}
              >
                <ColorChip color={color} className="size-full rounded-[4px]" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="bottom" align="start" width={248} className="kit-colorful flex flex-col gap-3" aria-label={`Palette colour ${i + 1}`}>
              <ColorPickerPanel
                color={color}
                alpha={false}
                palette={[]}
                onLive={(c) => live.onChange({ index: i, color: c })}
                onCommit={(c) => {
                  if (c) live.onChange({ index: i, color: c });
                  live.onCommit();
                }}
              />
            </PopoverContent>
          </Popover>
          {palette.length > 1 && (
            <button
              type="button"
              tabIndex={-1}
              aria-label={`Remove palette colour ${i + 1}`}
              onClick={() => remove(i)}
              className={cx(
                'absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full border border-line-strong bg-popover text-text-2 shadow-sm',
                'opacity-0 transition-opacity duration-(--dur-fast) group-hover/swatch:opacity-100 hover:text-text [&_svg]:size-2.5',
              )}
            >
              <X strokeWidth={3} />
            </button>
          )}
        </div>
      ))}
      {palette.length < PALETTE_MAX && (
        <Tooltip content="Add a colour">
          <button
            type="button"
            aria-label="Add a colour"
            onClick={add}
            className={cx(
              'flex size-[26px] items-center justify-center rounded-[7px] border border-dashed border-line-strong text-text-3 outline-none',
              'transition-colors duration-(--dur-fast) hover:border-text-3 hover:bg-field hover:text-text [&_svg]:size-3.5',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
            )}
          >
            <Plus />
          </button>
        </Tooltip>
      )}
    </div>
  );
});
