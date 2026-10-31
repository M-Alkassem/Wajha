/**
 * Brand kit: the colours, fonts and logo of a brand, kept once for the whole
 * library and applied to the open project. Colours become the theme palette,
 * a font is copied into the project and set for headings or body text, and
 * the logo goes onto every slide.
 */
import { useCallback, useEffect, useState } from 'react';
import { ImagePlus, Palette, Plus, Trash2, Type, X } from 'lucide-react';
import { resolveLayout } from '../../../model/resolve';
import type { ProjectFont } from '../../../model/types';
import { getPlatform } from '../../../platform';
import { importImagesWithReport, registerProjectFonts } from '../../../runtime';
import {
  MAX_BRAND_COLORS,
  MAX_BRAND_FONTS,
  copyBrandFontToProject,
  emptyBrandKit,
  putBrandFont,
  putBrandLogo,
  readBrandFile,
  readBrandKit,
  writeBrandKit,
  type BrandKit,
} from '../../../storage';
import { toast, useEditor } from '../../../store';
import { Button, ColorField, Dialog, DialogContent, IconButton, Spinner } from '../../kit';
import { fontPreviewFamily } from '../inspector/format';
import { logoSpot } from './logoSpot';
import { SectionHeading } from './parts';
import type { EditorDialogProps } from './types';

import { t } from '../../../i18n';
const message = (err: unknown) => (err instanceof Error && err.message ? err.message : String(err));

// Brand fonts are drawn in their own face in the list; each registers once.
const previewed = new Set<string>();
async function previewFonts(fonts: readonly ProjectFont[]): Promise<void> {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined') return;
  for (const font of fonts) {
    if (previewed.has(font.file)) continue;
    previewed.add(font.file);
    const bytes = await readBrandFile(font.file).catch(() => null);
    if (!bytes) continue;
    try {
      const face = new FontFace(font.family, bytes.slice().buffer, { weight: '1 1000' });
      await face.load();
      document.fonts.add(face);
    } catch {
      previewed.delete(font.file);
    }
  }
}

/** The brand logo as an object URL, revoked when the logo changes or the dialog closes. */
function useLogoUrl(file: string | null): string | null {
  const [shown, setShown] = useState<{ file: string; url: string } | null>(null);
  useEffect(() => {
    if (!file) return;
    let alive = true;
    let made: string | null = null;
    void readBrandFile(file).then((bytes) => {
      if (!alive || !bytes) return;
      made = URL.createObjectURL(new Blob([bytes.slice().buffer]));
      setShown({ file, url: made });
    });
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [file]);
  // A URL made for an earlier logo is never shown for the current one.
  return shown && shown.file === file ? shown.url : null;
}

export function BrandKitDialog({ open, onOpenChange }: EditorDialogProps) {
  const [kit, setKit] = useState<BrandKit | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [draftColor, setDraftColor] = useState('#7c5cff');
  const project = useEditor((s) => s.project);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void readBrandKit().then((k) => {
      if (!alive) return;
      setKit(k);
      void previewFonts(k.fonts);
    });
    return () => {
      alive = false;
    };
  }, [open]);

  const logoUrl = useLogoUrl(kit?.logo?.file ?? null);

  /** Saves a changed kit; the dialog shows what was stored. */
  const save = useCallback(async (next: BrandKit) => {
    try {
      const stored = await writeBrandKit(next);
      setKit(stored);
      void previewFonts(stored.fonts);
    } catch (err) {
      toast.error(t('Could not save the brand kit'), message(err));
    }
  }, []);

  const run = useCallback(async (label: string, work: () => Promise<void>) => {
    setBusy(label);
    try {
      await work();
    } catch (err) {
      toast.error(t('Something went wrong'), message(err));
    } finally {
      setBusy(null);
    }
  }, []);

  const k = kit ?? emptyBrandKit();
  const palette = project?.theme.palette ?? [];

  const addColor = (color: string) => {
    if (k.colors.includes(color) || k.colors.length >= MAX_BRAND_COLORS) return;
    void save({ ...k, colors: [...k.colors, color] });
  };

  const applyBrandFont = (font: ProjectFont, role: 'heading' | 'body') =>
    run(`font:${font.file}:${role}`, async () => {
      const p = useEditor.getState().project;
      if (!p) return;
      await copyBrandFontToProject(p.id, font);
      const store = useEditor.getState();
      store.addFonts([font]);
      const now = useEditor.getState().project;
      if (!now) return;
      await registerProjectFonts(now);
      // The project may already know this file under its own family name.
      const family = now.fonts?.find((f) => f.file === font.file)?.family ?? font.family;
      const { heading, body } = now.theme.fonts;
      store.applyFonts(role === 'heading' ? family : heading, role === 'body' ? family : body);
      toast.success(role === 'heading' ? t('{family} is now the headline font', { family }) : t('{family} is now the body text font', { family }));
    });

  const addLogoToSlides = () =>
    run('logo:slides', async () => {
      const p = useEditor.getState().project;
      if (!p || !k.logo) return;
      const bytes = await readBrandFile(k.logo.file);
      if (!bytes) throw new Error('The logo file is missing from the brand kit.');
      const { assets, skipped } = await importImagesWithReport(p.id, [{ name: k.logo.name, data: bytes }]);
      const asset = assets[0];
      if (!asset) throw new Error(skipped[0]?.message ?? 'The logo could not be imported.');
      const store = useEditor.getState();
      if (store.project?.id !== p.id) return;
      store.addAssets([asset]);
      const family = p.families[0];
      // A small mark in a free corner of each slide; derived devices and languages follow it.
      const aspect = asset.height / asset.width;
      let added = 0;
      for (const slide of useEditor.getState().project?.slides ?? []) {
        const now = useEditor.getState().project;
        const spot = logoSpot(now ? resolveLayout(now, slide, family) : undefined, family, aspect);
        const id = store.addElement(slide.id, family, 'image', { assetId: asset.id, patch: { ...spot, cornerRadius: 0 } });
        if (id) added++;
      }
      toast.success(added === 1 ? t('Logo added to the slide') : t('Logo added to {added} slides', { added }), t('Move or resize it on any slide; each slide keeps its own.'));
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="md"
        icon={<Palette />}
        title={t('Brand kit')}
        description={t("Keep your brand's colours, fonts and logo once, and use them in every project.")}
        footer={<Button onClick={() => onOpenChange(false)}>{t('Done')}</Button>}
      >
        {!kit ? (
          <div className="flex h-40 items-center justify-center">
            <Spinner label={t('Loading the brand kit')} />
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <section aria-labelledby="brand-colors" className="flex flex-col gap-2.5">
              <SectionHeading id="brand-colors">{t('Colours')}</SectionHeading>
              <div className="flex flex-wrap items-center gap-2">
                {k.colors.map((c) => (
                  <div key={c} className="group/swatch relative">
                    <span aria-label={c} role="img" className="block size-9 rounded-md border border-line shadow-[var(--highlight)]" style={{ background: c }} />
                    <button
                      type="button"
                      aria-label={t('Remove {c}', { c })}
                      onClick={() => void save({ ...k, colors: k.colors.filter((x) => x !== c) })}
                      className="absolute -top-1.5 -right-1.5 hidden size-4 items-center justify-center rounded-full bg-surface-3 text-text-2 shadow-sm group-focus-within/swatch:flex group-hover/swatch:flex hover:text-text"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
                {k.colors.length < MAX_BRAND_COLORS && (
                  <div className="flex items-center gap-1.5">
                    <ColorField value={draftColor} onChange={setDraftColor} onCommit={addColor} alpha={false} palette={palette} showInput={false} label={t('Add a colour')} />
                    <span className="text-xs text-text-3">{t('Add')}</span>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" leadingIcon={<Plus />} disabled={!palette.length} onClick={() => void save({ ...k, colors: [...k.colors, ...palette.filter((c) => !k.colors.includes(c))] })}>
                  {t("Add this project's colours")}
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!k.colors.length || !project}
                  onClick={() => {
                    if (useEditor.getState().setPalette(k.colors)) toast.success(t('Theme colours updated'), t('Pick them in any colour field of this project.'));
                    else toast.info(t('Theme colours already match'), t('This project already uses the brand colours.'));
                  }}
                >
                  {t('Use as theme colours')}
                </Button>
              </div>
            </section>

            <section aria-labelledby="brand-fonts" className="flex flex-col gap-2.5">
              <SectionHeading
                id="brand-fonts"
                trailing={
                  k.fonts.length < MAX_BRAND_FONTS && (
                    <Button
                      size="sm"
                      variant="ghost"
                      leadingIcon={busy === 'font:add' ? <Spinner size={12} label={null} /> : <Plus />}
                      disabled={busy !== null}
                      onClick={() =>
                        void run('font:add', async () => {
                          const picked = await getPlatform().openFile('font');
                          if (!picked) return;
                          const font = await putBrandFont(picked.data, picked.name);
                          await save({ ...k, fonts: [...k.fonts, font] });
                        })
                      }
                    >
                      {t('Add font file…')}
                    </Button>
                  )
                }
              >
                {t('Fonts')}
              </SectionHeading>
              {k.fonts.length === 0 ? (
                <p className="text-xs text-text-3">{t("Add the .ttf, .otf, .woff or .woff2 files of your brand's typefaces.")}</p>
              ) : (
                <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
                  {k.fonts.map((font) => (
                    <li key={font.file} className="flex items-center gap-3 px-3 py-2">
                      <Type aria-hidden className="size-4 shrink-0 text-text-3" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-text" style={{ fontFamily: fontPreviewFamily(font.family) }}>
                          {font.family}
                        </div>
                        <div className="truncate text-2xs text-text-3">{font.name}</div>
                      </div>
                      <Button size="sm" disabled={!project || busy !== null} onClick={() => void applyBrandFont(font, 'heading')}>
                        {t('Headlines')}
                      </Button>
                      <Button size="sm" disabled={!project || busy !== null} onClick={() => void applyBrandFont(font, 'body')}>
                        {t('Body text')}
                      </Button>
                      <IconButton label={t('Remove {family}', { family: font.family })} icon={<Trash2 />} size="sm" onClick={() => void save({ ...k, fonts: k.fonts.filter((f) => f.file !== font.file) })} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="brand-logo" className="flex flex-col gap-2.5">
              <SectionHeading id="brand-logo">{t('Logo')}</SectionHeading>
              <div className="flex items-center gap-3">
                <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line kit-checker">
                  {logoUrl ? <img src={logoUrl} alt={t('Logo: {name}', { name: k.logo?.name ?? '' })} className="max-h-full max-w-full object-contain" /> : <ImagePlus aria-hidden className="size-5 text-text-3" />}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={busy !== null}
                    onClick={() =>
                      void run('logo:pick', async () => {
                        const picked = await getPlatform().openFile('image');
                        if (!picked) return;
                        const logo = await putBrandLogo(picked.data, picked.name);
                        await save({ ...k, logo });
                      })
                    }
                  >
                    {k.logo ? t('Replace logo…') : t('Choose logo…')}
                  </Button>
                  {k.logo && (
                    <>
                      <Button size="sm" variant="primary" disabled={!project || busy !== null} onClick={() => void addLogoToSlides()}>
                        {t('Add to every slide')}
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void save({ ...k, logo: null })}>
                        {t('Remove')}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
