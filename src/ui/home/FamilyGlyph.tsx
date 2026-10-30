import type { ReactNode, SVGProps } from 'react';
import type { FamilyId } from '../../model/types';

export interface FamilyGlyphProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  family: FamilyId;
  size?: number;
}

/**
 * Line icons for device families in the lucide style (24 grid, 2 px
 * stroke). Apple devices carry a Dynamic Island pill, Android ones a
 * punch-hole camera, so iPhone and Android phone stay distinguishable at
 * 12 px without a label.
 */
export function FamilyGlyph({ family, size = 16, strokeWidth = 2, ...rest }: FamilyGlyphProps) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {GLYPHS[family]}
    </svg>
  );
}

const GLYPHS: Record<FamilyId, ReactNode> = {
  iphone: (
    <>
      <rect x="6" y="2" width="12" height="20" rx="3" />
      <path d="M10.5 5.5h3" />
    </>
  ),
  'android-phone': (
    <>
      <rect x="6" y="2" width="12" height="20" rx="2" />
      <circle cx="12" cy="5.75" r="0.6" fill="currentColor" />
    </>
  ),
  ipad: (
    <>
      <rect x="4" y="2" width="16" height="20" rx="2.5" />
      <path d="M11 5h2" />
    </>
  ),
  'android-tablet': (
    <>
      <rect x="4" y="2" width="16" height="20" rx="1.75" />
      <circle cx="12" cy="5.25" r="0.6" fill="currentColor" />
    </>
  ),
  mac: (
    <>
      <rect x="4" y="4.5" width="16" height="11" rx="1.5" />
      <path d="M2 19.5h20" />
      <path d="M10 19.5l0.5-1.5h3l0.5 1.5" />
    </>
  ),
  'play-feature': (
    <>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M10.5 9.75v4.5l3.75-2.25z" />
    </>
  ),
};
