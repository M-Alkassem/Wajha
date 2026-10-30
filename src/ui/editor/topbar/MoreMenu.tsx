import { Ellipsis, FileArchive, Keyboard, LayoutTemplate } from 'lucide-react';
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

/** Overflow menu: templates, the project file, panel visibility and the shortcuts sheet. */
export function MoreMenu() {
  const leftOpen = useEditorChrome((s) => s.leftOpen);
  const rightOpen = useEditorChrome((s) => s.rightOpen);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton label="More" icon={<Ellipsis />} tooltipSide="bottom" className="aria-expanded:bg-surface-2 aria-expanded:text-text" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[240px]">
        <DropdownMenuItem icon={<LayoutTemplate />} onSelect={() => useEditorUi.getState().openDialog('saveTemplate')}>
          Save as template…
        </DropdownMenuItem>
        <DropdownMenuItem icon={<FileArchive />} onSelect={() => void exportProjectFile()}>
          Export project file…
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Panels</DropdownMenuLabel>
        <DropdownMenuCheckboxItem checked={leftOpen} onCheckedChange={(v) => useEditorChrome.getState().setLeftOpen(v === true)} shortcut={shortcutKeys('toggleSidebar')}>
          Slides and layers
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked={rightOpen} onCheckedChange={(v) => useEditorChrome.getState().setRightOpen(v === true)} shortcut={shortcutKeys('toggleInspector')}>
          Inspector
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={<Keyboard />} shortcut={shortcutKeys('shortcuts')} onSelect={() => useEditorUi.getState().openDialog('shortcuts')}>
          Keyboard shortcuts
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
