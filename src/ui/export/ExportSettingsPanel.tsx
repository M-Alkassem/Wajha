/**
 * Left column of the export dialog: sizes per device, languages, format and
 * folder structure with a live preview of the folders.
 */
import { memo, useId, useMemo } from 'react';
import { File, FileImage, Folder, FolderOpen, FolderTree, Info, Rocket, Store } from 'lucide-react';
import { FAMILIES } from '../../model/catalog';
import type { ExportSize, ExportStructure, FamilyId, LangCode, Project, StoreId } from '../../model/types';
import { Badge, Checkbox, IconButton, SegmentedControl, Slider, Tooltip, cx } from '../kit';
import { FamilyIcon, RadioCards, SectionHeading, type RadioCardOption } from '../editor/dialogs/parts';
import { languageName, localeFor, nativeName, storeName, storesOf } from '../editor/dialogs/labels';
import type { TreeLine } from './exportModel';

import { t } from '../../i18n';
import { tx } from '../../i18n/react';
/** Why the iPhone has two default sizes (Apple's current rules). */
const IPHONE_SIZES_NOTE =
  'App Store Connect asks for two iPhone sets: 6.3″ for the iPhone 17, 17 Pro and 16 Pro, and 6.9″ for the large models (6.5″ also works instead). Smaller iPhones show scaled versions of these.';

const STRUCTURES: readonly RadioCardOption<ExportStructure>[] = [
  { value: 'stores', title: t('Stores'), description: t('App Store and Google Play folders'), icon: <Store /> },
  { value: 'fastlane', title: 'fastlane', description: t('Drop into your app repository'), icon: <Rocket /> },
  { value: 'flat', title: t('Flat'), description: t('One folder per size and language'), icon: <FolderTree /> },
];

export interface ExportSettingsPanelProps {
  project: Project;
  sizes: readonly string[];
  languages: readonly LangCode[];
  format: 'png' | 'jpeg';
  quality: number;
  structure: ExportStructure;
  tree: readonly TreeLine[];
  /** Caption over the folder preview ("Inside the folder you choose"). */
  treeCaption: string;
  disabled?: boolean;
  onSizeChange(id: string, on: boolean): void;
  onLanguageChange(code: LangCode, on: boolean): void;
  onFormatChange(format: 'png' | 'jpeg'): void;
  onQualityChange(quality: number, done: boolean): void;
  onStructureChange(structure: ExportStructure): void;
}

export function ExportSettingsPanel(props: ExportSettingsPanelProps) {
  const { project, sizes, languages, format, quality, structure, tree, treeCaption, disabled } = props;
  const ids = useId();
  const stores = useMemo(() => storesOf(project.families), [project.families]);
  return (
    <div className={cx('flex flex-col gap-7 px-5 pt-4 pb-6', disabled && 'pointer-events-none opacity-60')} aria-disabled={disabled || undefined}>
      <section aria-labelledby={`${ids}-sizes`} className="flex flex-col gap-3">
        <SectionHeading id={`${ids}-sizes`}>{t('Sizes')}</SectionHeading>
        <div className="flex flex-col gap-4">
          {project.families.map((family) => (
            <FamilySizes key={family} family={family} selected={sizes} onChange={props.onSizeChange} />
          ))}
        </div>
      </section>

      <section aria-labelledby={`${ids}-langs`} className="flex flex-col gap-3">
        <SectionHeading id={`${ids}-langs`}>{t('Languages')}</SectionHeading>
        <LanguageTable languages={project.languages} selected={languages} stores={stores} onChange={props.onLanguageChange} />
      </section>

      <section aria-labelledby={`${ids}-format`} className="flex flex-col gap-3">
        <SectionHeading id={`${ids}-format`}>{t('Format')}</SectionHeading>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-4">
            <div className="w-40 shrink-0">
              <SegmentedControl
                aria-label={t('Format')}
                value={format}
                onValueChange={props.onFormatChange}
                fullWidth
                options={[
                  { value: 'png', label: t('PNG') },
                  { value: 'jpeg', label: t('JPEG') },
                ]}
              />
            </div>
            <p className="min-w-0 text-xs leading-4 text-text-2">
              {format === 'png' ? t('Lossless 24-bit, no transparency: what both stores accept.') : t('Smaller files. Fine for photos, softer on text and edges.')}
            </p>
          </div>
          {format === 'jpeg' && (
            <div className="flex items-center gap-4">
              <span className="w-40 shrink-0 text-xs text-text-2">{t('Quality')}</span>
              <Slider
                aria-label={t('JPEG quality')}
                value={Math.round(quality * 100)}
                min={50}
                max={100}
                step={1}
                format={(v) => `${v}%`}
                onChange={(v) => props.onQualityChange(v / 100, false)}
                onCommit={(v) => props.onQualityChange(v / 100, true)}
                className="max-w-60"
              />
              <span className="w-9 shrink-0 text-right text-xs text-text-2 tabular-nums">{Math.round(quality * 100)}%</span>
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby={`${ids}-structure`} className="flex flex-col gap-3">
        <SectionHeading id={`${ids}-structure`}>{t('Folder structure')}</SectionHeading>
        <RadioCards aria-labelledby={`${ids}-structure`} value={structure} onValueChange={props.onStructureChange} options={STRUCTURES} />
        <FolderPreview lines={tree} caption={treeCaption} />
      </section>
    </div>
  );
}

/* Sizes ------------------------------------------------------------------ */

const FamilySizes = memo(function FamilySizes({
  family,
  selected,
  onChange,
}: {
  family: FamilyId;
  selected: readonly string[];
  onChange(id: string, on: boolean): void;
}) {
  const info = FAMILIES[family];
  const count = info.sizes.filter((s) => selected.includes(s.id)).length;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-6 items-center gap-2 px-0.5">
        <FamilyIcon family={family} className="size-3.5 text-text-2" />
        <span className="text-xs font-medium text-text">{info.label}</span>
        <span className="text-xs text-text-3">{info.stores.map(storeName).join(', ')}</span>
        {family === 'iphone' && (
          <IconButton size="sm" label={t('Why two iPhone sizes?')} tooltip={IPHONE_SIZES_NOTE} icon={<Info />} className="-my-1 text-text-3" />
        )}
        <span className={cx('ml-auto text-2xs tabular-nums', count === 0 ? 'text-warning' : 'text-text-3')}>
          {count === 0 ? t('Not exported') : t('{count} of {length}', { count, length: info.sizes.length })}
        </span>
      </div>
      <div className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-field light:bg-raised">
        {info.sizes.map((size) => (
          <SizeRow key={size.id} size={size} checked={selected.includes(size.id)} onChange={onChange} />
        ))}
      </div>
    </div>
  );
});

const SizeRow = memo(function SizeRow({ size, checked, onChange }: { size: ExportSize; checked: boolean; onChange(id: string, on: boolean): void }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex h-9 cursor-default items-center gap-2.5 px-3 transition-colors duration-(--dur-fast) hover:bg-field-hover">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(size.id, v === true)} />
      <Tooltip content={size.devices} side="top" align="start">
        <span className="truncate text-ui text-text">{size.label}</span>
      </Tooltip>
      <span className="sr-only">{tx('for {devices}', { devices: size.devices })}</span>
      {size.required && (
        <Badge size="sm" variant="accent">
          {t('Required')}
        </Badge>
      )}
      <span className="ml-auto shrink-0 font-mono text-2xs text-text-3 tabular-nums">
        {size.width} × {size.height}
      </span>
    </label>
  );
});

/* Languages ------------------------------------------------------------------ */

const LanguageTable = memo(function LanguageTable({
  languages,
  selected,
  stores,
  onChange,
}: {
  languages: readonly LangCode[];
  selected: readonly LangCode[];
  stores: readonly StoreId[];
  onChange(code: LangCode, on: boolean): void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-field light:bg-raised">
      <div className="flex h-7 items-center gap-2.5 border-b border-line px-3 text-2xs font-medium text-text-3" aria-hidden>
        <span className="w-4 shrink-0" />
        <span className="flex-1">{t('Language')}</span>
        {stores.map((s) => (
          <span key={s} className="w-24 shrink-0 text-right">
            {storeName(s)}
          </span>
        ))}
      </div>
      <div className="divide-y divide-line">
        {languages.map((code, i) => (
          <LanguageRow key={code} code={code} base={i === 0} checked={selected.includes(code)} stores={stores} onChange={onChange} />
        ))}
      </div>
    </div>
  );
});

const LanguageRow = memo(function LanguageRow({
  code,
  base,
  checked,
  stores,
  onChange,
}: {
  code: LangCode;
  base: boolean;
  checked: boolean;
  stores: readonly StoreId[];
  onChange(code: LangCode, on: boolean): void;
}) {
  const id = useId();
  const native = nativeName(code);
  const name = languageName(code);
  return (
    <label htmlFor={id} className="flex h-9 cursor-default items-center gap-2.5 px-3 transition-colors duration-(--dur-fast) hover:bg-field-hover">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(code, v === true)} />
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-ui text-text">{name}</span>
        {native && (
          <span dir="auto" lang={code} className="truncate text-xs text-text-3">
            {native}
          </span>
        )}
        {base && (
          <Badge size="sm" variant="neutral">
            {t('Base')}
          </Badge>
        )}
      </span>
      {stores.map((store) => {
        const locale = localeFor(code, store);
        return locale ? (
          <span key={store} className="w-24 shrink-0 text-right font-mono text-2xs text-text-2">
            <span className="sr-only">{storeName(store)}: </span>
            {locale}
          </span>
        ) : (
          <Tooltip key={store} content={t('{storeName} has no {name} localization, so {name2} is skipped for {storeName2} sizes.', { storeName: storeName(store), name, name2: name, storeName2: storeName(store) })}>
            <span className="w-24 shrink-0 text-right text-2xs font-medium text-warning">
              <span className="sr-only">{storeName(store)}: </span>
              {t('Not offered')}
            </span>
          </Tooltip>
        );
      })}
    </label>
  );
});

/* Folder preview ------------------------------------------------------------------ */

const FolderPreview = memo(function FolderPreview({ lines, caption }: { lines: readonly TreeLine[]; caption: string }) {
  return (
    <figure className="flex flex-col gap-2 rounded-lg border border-line bg-field px-3 pt-2.5 pb-3 light:bg-surface">
      <figcaption className="text-2xs font-medium text-text-3">{caption}</figcaption>
      {lines.length === 0 ? (
        <p className="py-3 text-xs text-text-3">{t('Select a size and a language to see where files go.')}</p>
      ) : (
        <ul className="flex flex-col font-mono text-2xs leading-5 text-text-2" aria-label={t('Files and folders')}>
          {lines.map((line, i) => (
            <TreeRow key={i} line={line} />
          ))}
        </ul>
      )}
    </figure>
  );
});

function TreeRow({ line }: { line: TreeLine }) {
  const pad = { paddingInlineStart: line.depth * 16 };
  if (line.kind === 'more-files' || line.kind === 'more-folders') {
    const text =
      line.kind === 'more-files'
        ? `${line.count} more ${line.count === 1 ? 'file' : 'files'}`
        : `${line.count} more ${line.count === 1 ? 'folder' : 'folders'} · ${line.files} ${line.files === 1 ? 'file' : 'files'}`;
    return (
      <li style={pad} className="flex items-center gap-1.5 font-sans text-text-3">
        <span aria-hidden className="w-3.5 text-center">+</span>
        {text}
      </li>
    );
  }
  const folder = line.kind === 'folder';
  const Icon = folder ? (line.open ? FolderOpen : Folder) : /\.(png|jpe?g)$/i.test(line.name) ? FileImage : File;
  return (
    <li style={pad} className="flex min-w-0 items-center gap-1.5">
      <Icon aria-hidden className={cx('size-3.5 shrink-0', folder ? 'text-accent-fg' : 'text-text-3')} />
      <span className={cx('truncate', folder ? 'text-text' : 'text-text-2')}>{line.name}</span>
      {folder && line.count !== undefined && (
        <span className="ml-auto shrink-0 pl-3 font-sans text-text-3 tabular-nums">
          {line.count} {line.count === 1 ? 'file' : 'files'}
        </span>
      )}
    </li>
  );
}
