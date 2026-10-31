import { Logo } from './Logo';

import { t } from '../../i18n';
export interface WordmarkProps {
  size?: 'sm' | 'md' | 'lg';
  /** Show the mark before the name (default true). */
  showMark?: boolean;
  /** Show the Arabic name واجهة beside it (default true). */
  showArabic?: boolean;
  className?: string;
}

const SIZES = {
  sm: { mark: 20, gap: 'gap-2', latin: 'text-[15px]', arabic: 'text-[11px]' },
  md: { mark: 26, gap: 'gap-2.5', latin: 'text-[19px]', arabic: 'text-[13px]' },
  lg: { mark: 44, gap: 'gap-3.5', latin: 'text-[34px]', arabic: 'text-[20px]' },
} as const;

/** "Wajha" in the display face with a quiet واجهة beside it, optionally led by the mark. */
export function Wordmark({ size = 'md', showMark = true, showArabic = true, className }: WordmarkProps) {
  const s = SIZES[size];
  return (
    <span className={`inline-flex items-center ${s.gap} select-none ${className ?? ''}`}>
      {showMark && <Logo size={s.mark} title={null} />}
      <span className="inline-flex items-baseline gap-[0.4em] leading-none">
        <span className={`font-brand font-semibold tracking-[-0.035em] text-text ${s.latin}`}>{t('Wajha')}</span>
        {showArabic && (
          <span lang="ar" dir="rtl" className={`font-brand-ar font-medium text-text-3 ${s.arabic}`}>
            واجهة
          </span>
        )}
      </span>
    </span>
  );
}
