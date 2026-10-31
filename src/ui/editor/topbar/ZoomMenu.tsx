import { ChevronDown, ZoomIn, ZoomOut } from 'lucide-react';
import { useEditor } from '../../../store';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  cx,
} from '../../kit';
import { shortcutKeys } from '../shortcuts';
import { ZOOM_PRESETS, zoomChoice, zoomLabel } from './zoom';

import { t } from '../../../i18n';
/** Zoom level button with zoom in / out (the menu stays open), fit and fixed levels. */
export function ZoomMenu() {
  const zoom = useEditor((s) => s.zoom);
  const fit = useEditor((s) => s.fit);
  const label = zoomLabel(zoom, fit);

  return (
    <DropdownMenu>
      <Tooltip content={t('Zoom')} side="bottom">
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t('Zoom: {v}', { v: fit ? 'fit to window' : label })}
            className={cx(
              'inline-flex h-7 w-[68px] shrink-0 items-center justify-center gap-1 rounded-sm px-1.5 text-ui text-text-2 tabular-nums outline-none select-none',
              'transition-colors duration-(--dur-fast) hover:bg-surface-2 hover:text-text aria-expanded:bg-surface-2 aria-expanded:text-text',
              'focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-1 focus-visible:outline-focus',
            )}
          >
            <span>{label}</span>
            <ChevronDown className="size-3 shrink-0 text-text-3" />
          </button>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent align="end" className="min-w-[212px]">
        <DropdownMenuItem
          icon={<ZoomIn />}
          shortcut={shortcutKeys('zoomIn')}
          onSelect={(e) => {
            // Stays open so the level can be stepped with repeated clicks.
            e.preventDefault();
            useEditor.getState().zoomIn();
          }}
        >
          {t('Zoom in')}
        </DropdownMenuItem>
        <DropdownMenuItem
          icon={<ZoomOut />}
          shortcut={shortcutKeys('zoomOut')}
          onSelect={(e) => {
            e.preventDefault();
            useEditor.getState().zoomOut();
          }}
        >
          {t('Zoom out')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={zoomChoice(zoom, fit)}
          onValueChange={(v) => {
            if (v === 'fit') useEditor.getState().setFit(true);
            else useEditor.getState().setZoom(Number(v));
          }}
        >
          <DropdownMenuRadioItem value="fit" shortcut={shortcutKeys('zoomFit')}>
            {t('Fit to window')}
          </DropdownMenuRadioItem>
          {ZOOM_PRESETS.map((p) => (
            <DropdownMenuRadioItem key={p} value={String(p)}>
              <span className="tabular-nums">{Math.round(p * 100)}%</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

