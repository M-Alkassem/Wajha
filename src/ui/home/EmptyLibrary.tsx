import { useEffect, useMemo } from 'react';
import { ArrowRight, FolderOpen, Heart, Plus, ShieldCheck, WifiOff } from 'lucide-react';
import type { Project } from '../../model/types';
import { BUILTIN_TEMPLATES } from '../../templates';
import { Logo } from '../brand/Logo';
import { Button } from '../kit';
import { SlidePreview } from '../shared/SlidePreview';
import { useHomeUi } from './homeUi';
import { openProjectFile, useLibrary } from './library';
import { TemplateCard } from './TemplateCard';
import { heroPreviewProject, requestPreviewFonts } from './templates';

import { t } from '../../i18n';
/**
 * First run: the hero (what Wajha does, the two ways in) beside a fan of
 * live slides, then a row of built-in templates that open the new-project
 * flow with that template picked.
 */
export function EmptyLibrary() {
  const openNew = useHomeUi((s) => s.openNewProject);
  const importing = useLibrary((s) => s.importing);
  const sample = useMemo(() => heroPreviewProject(BUILTIN_TEMPLATES), []);
  const featured = BUILTIN_TEMPLATES.slice(0, 4);

  return (
    <div className="relative mx-auto flex w-full max-w-[1180px] flex-1 flex-col px-10 2xl:max-w-[1280px]">
      <section aria-labelledby="home-hero-title" className="grid flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-10 gap-y-8 pt-10 pb-12">
        <div className="home-rise flex max-w-[500px] flex-col items-start">
          <AppIcon />
          <h1
            id="home-hero-title"
            className="mt-7 font-display text-[40px] leading-[46px] font-semibold tracking-[-0.035em] text-balance text-text 2xl:text-[46px] 2xl:leading-[52px]"
          >
            {t('Make your app store page')}{' '}
            <span className="bg-[image:var(--brand-gradient)] bg-clip-text text-transparent light:bg-[image:var(--brand-gradient-strong)]">{t('shine')}</span>
          </h1>
          <p className="mt-4 max-w-[460px] text-[15px] leading-6 text-pretty text-text-2">
            {t('Design App Store and Google Play screenshots from beautiful templates, then export every size, device and language in one go.')}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-2.5">
            <Button variant="primary" size="lg" leadingIcon={<Plus />} onClick={() => openNew()}>
              {t('Create your first project')}
            </Button>
            <Button size="lg" leadingIcon={<FolderOpen />} loading={importing} onClick={() => void openProjectFile()}>
              {t('Open a .wajha file')}
            </Button>
          </div>
          <ul className="mt-9 flex flex-wrap gap-x-5 gap-y-2 text-xs text-text-3 [&_svg]:size-3.5">
            <li className="flex items-center gap-1.5">
              <WifiOff aria-hidden />
              {t('Works offline')}
            </li>
            <li className="flex items-center gap-1.5">
              <ShieldCheck aria-hidden />
              {t('No account, no tracking')}
            </li>
            <li className="flex items-center gap-1.5">
              <Heart aria-hidden />
              {t('Free and open source')}
            </li>
          </ul>
        </div>
        <HeroFan project={sample} />
      </section>

      {featured.length > 0 && (
        <section aria-labelledby="home-featured-title" className="home-rise pb-12" style={{ ['--i' as string]: 3 }}>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <h2 id="home-featured-title" className="text-[15px] leading-5 font-semibold tracking-[-0.01em] text-text">
                {t('Start from a template')}
              </h2>
              <p className="text-xs text-text-3">{t('Every template comes with mock screens, sample copy and layouts for each device.')}</p>
            </div>
            <Button variant="ghost" trailingIcon={<ArrowRight />} onClick={() => openNew({ source: 'builtin' })}>
              {t('Browse all templates')}
            </Button>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
            {featured.map((t) => (
              <TemplateCard key={t.id} template={t} mode="action" onSelect={() => openNew({ templateId: t.id, source: 'builtin' })} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** The mark on its night tile, like the app icon, with a warm glow. */
function AppIcon() {
  return (
    <span className="relative flex size-[60px] items-center justify-center">
      <span aria-hidden className="kit-glow pointer-events-none absolute -inset-20 opacity-[0.16] light:opacity-[0.14]" />
      <span className="relative flex size-full items-center justify-center rounded-[16px] bg-[var(--brand-night)] shadow-lg ring-1 ring-line-strong">
        <span aria-hidden className="absolute inset-0 rounded-[inherit] opacity-45" style={{ background: 'radial-gradient(60% 55% at 50% 64%, var(--brand-pink), transparent)' }} />
        <Logo size={42} title={t('Wajha')} className="relative" />
      </span>
    </span>
  );
}

const SLIDE_W = 150;
const POSES = [
  { x: -112, y: 22, r: -8, z: 0 },
  { x: 0, y: 0, r: 0, z: 2 },
  { x: 112, y: 22, r: 8, z: 1 },
] as const;

/** Three live slides fanned out on a soft brand glow; they spread a little on hover. */
function HeroFan({ project }: { project: Project }) {
  useEffect(() => requestPreviewFonts(project), [project]);
  const count = Math.min(3, project.slides.length);
  // With fewer than three slides, the middle pose goes first.
  const poses = count === 1 ? [POSES[1]] : count === 2 ? [POSES[0], POSES[2]] : POSES;
  return (
    <div aria-hidden className="relative h-[400px] w-[420px] shrink-0 select-none [--spread:1] hover:[--spread:1.12]">
      <div className="kit-glow pointer-events-none absolute top-1/2 left-1/2 h-[544px] w-[610px] -translate-x-1/2 -translate-y-1/2 opacity-25 light:opacity-20" />
      {poses.map((p, i) => (
        <div
          key={i}
          className="absolute top-1/2 left-1/2 overflow-hidden rounded-[14px] shadow-slide ring-1 ring-line transition-transform duration-(--dur-slow) ease-out"
          style={{
            zIndex: p.z,
            transform: `translate(-50%, -50%) translate(calc(${p.x}px * var(--spread)), ${p.y}px) rotate(calc(${p.r}deg * var(--spread)))`,
          }}
        >
          <SlidePreview project={project} slideIndex={i} family="iphone" lang="en-US" width={SLIDE_W} />
        </div>
      ))}
    </div>
  );
}
