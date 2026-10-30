import { ChevronDown, Languages, Sheet } from 'lucide-react';
import { languageInfo } from '../../../model/catalog';
import type { LangCode } from '../../../model/types';
import { useEditor } from '../../../store';
import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  cx,
} from '../../kit';
import { useEditorUi } from '../editorUi';

const NO_LANGUAGES: LangCode[] = [];

export interface LanguageMenuProps {
  /** Show the native name next to the code. */
  showName: boolean;
}

/** Language the stage previews: the code (plus native name when there is room), project languages in the menu. */
export function LanguageMenu({ showName }: LanguageMenuProps) {
  const languages = useEditor((s) => s.project?.languages ?? NO_LANGUAGES);
  const active = useEditor((s) => s.activeLang);
  const info = languageInfo(active);

  return (
    <DropdownMenu>
      <Tooltip content="Preview language" side="bottom">
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Preview language: ${info.name}`}
            className={cx(
              'inline-flex h-7 max-w-[200px] min-w-0 shrink-0 items-center gap-1.5 rounded-sm pr-1.5 pl-1 text-ui text-text-2 outline-none select-none',
              'transition-colors duration-(--dur-fast) hover:bg-surface-2 hover:text-text aria-expanded:bg-surface-2 aria-expanded:text-text',
              'focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-1 focus-visible:outline-focus',
            )}
          >
            <span className="inline-flex h-5 shrink-0 items-center rounded-[5px] border border-line bg-surface-2 px-1.5 text-2xs font-semibold text-text tabular-nums">
              {active}
            </span>
            {showName && (
              <span dir="auto" className="min-w-0 truncate">
                {info.native}
              </span>
            )}
            <ChevronDown className="size-3 shrink-0 text-text-3" />
          </button>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-[272px]">
        <DropdownMenuLabel>Preview language</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={active} onValueChange={(code) => useEditor.getState().setActiveLang(code)}>
          {languages.map((code, i) => {
            const l = languageInfo(code);
            return (
              <DropdownMenuRadioItem key={code} value={code}>
                <span className="flex min-w-0 items-center gap-2">
                  <span dir="auto" className="min-w-0 shrink truncate">
                    {l.native}
                  </span>
                  {l.name !== l.native && <span className="min-w-0 shrink-[2] truncate text-text-3">{l.name}</span>}
                  <span className="ml-auto flex shrink-0 items-center gap-1 pl-1">
                    {i === 0 && (
                      <Badge size="sm" title="Base language: the others fall back to it">
                        Base
                      </Badge>
                    )}
                    {l.rtl && (
                      <Badge size="sm" title="Right-to-left">
                        RTL
                      </Badge>
                    )}
                  </span>
                </span>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={<Languages />} onSelect={() => useEditorUi.getState().openDialog('languages')}>
          Manage languages…
        </DropdownMenuItem>
        <DropdownMenuItem icon={<Sheet />} onSelect={() => useEditorUi.getState().openDialog('translations')}>
          Translations…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
