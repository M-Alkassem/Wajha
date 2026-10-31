import { Ellipsis, FileArchive, Keyboard, LayoutTemplate, Palette } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
} from '../../kit';
import { useEditorChrome } from '../chrome';
import { useEditorUi } from '../editorUi';
import { shortcutKeys } from '../shortcuts';
import { exportProjectFile } from './actions';

import { t } from '../../../i18n';
/** Overflow menu: templates, the project file, panel visibility and the shortcuts sheet. */
export function MoreMenu() {
  const leftOpen = useEditorChrome((s) => s.leftOpen);
  const rightOpen = useEditorChrome((s) => s.rightOpen);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton label={t('More')} icon={<Ellipsis />} tooltipSide="bottom" className="aria-expanded:bg-surface-2 aria-expanded:text-text" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[240px]">
        <DropdownMenuItem icon={<LayoutTemplate />} onSelect={() => useEditorUi.getState().openDialog('saveTemplate')}>
          {t('Save as template…')}
        </DropdownMenuItem>
        <DropdownMenuItem icon={<FileArchive />} onSelect={() => void exportProjectFile()}>
          {t('Export project file…')}
        </DropdownMenuItem>
        <DropdownMenuItem icon={<Palette />} onSelect={() => useEditorUi.getState().openDialog('brand')}>
          {t('Brand kit…')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t('Panels')}</DropdownMenuLabel>
        <DropdownMenuCheckboxItem checked={leftOpen} onCheckedChange={(v) => useEditorChrome.getState().setLeftOpen(v === true)} shortcut={shortcutKeys('toggleSidebar')}>
          {t('Slides and layers')}
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked={rightOpen} onCheckedChange={(v) => useEditorChrome.getState().setRightOpen(v === true)} shortcut={shortcutKeys('toggleInspector')}>
          {t('Inspector')}
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={<Keyboard />} shortcut={shortcutKeys('shortcuts')} onSelect={() => useEditorUi.getState().openDialog('shortcuts')}>
          {t('Keyboard shortcuts')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
