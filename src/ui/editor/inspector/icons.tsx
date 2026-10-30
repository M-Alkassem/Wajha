/**
 * Small custom icons in the lucide style (24 px grid, currentColor) for
 * things lucide has no glyph for: blob and ring shapes, filled shape kinds.
 */
import type { SVGProps } from 'react';
import { AppWindowMac, Circle, Image as ImageIcon, Laptop, RectangleVertical, Smartphone, Square, Tablet, Type } from 'lucide-react';
import type { SlideElement } from '../../../model/types';

type IconProps = SVGProps<SVGSVGElement>;

function Svg({ children, ...props }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      {children}
    </svg>
  );
}

const BLOB = 'M12.4 3.2c3.3-.4 6.9 1.6 7.9 4.8.9 2.9-.7 4.6-.4 7.2.3 2.6-1.8 5.2-5 5.6-3.1.4-4.4-1.4-7.2-1.6-2.7-.2-4.6-2.4-4.4-5.3.2-2.7 2.2-3.5 3-6 .9-2.6 3-4.4 6.1-4.7Z';

export function BlobIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d={BLOB} />
    </Svg>
  );
}

export function RingIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" strokeWidth="3.2" />
    </Svg>
  );
}

/** Filled glyphs for the shape kind picker: what the shape looks like on a slide. */
export function ShapeGlyph({ shape, ...props }: IconProps & { shape: 'circle' | 'rect' | 'blob' | 'ring' }) {
  switch (shape) {
    case 'circle':
      return (
        <Svg {...props} stroke="none" fill="currentColor">
          <circle cx="12" cy="12" r="8.5" />
        </Svg>
      );
    case 'rect':
      return (
        <Svg {...props} stroke="none" fill="currentColor">
          <rect x="3.5" y="5.5" width="17" height="13" rx="3.5" />
        </Svg>
      );
    case 'blob':
      return (
        <Svg {...props} stroke="none" fill="currentColor">
          <path d={BLOB} />
        </Svg>
      );
    case 'ring':
      return <RingIcon {...props} />;
  }
}

/** Icon for an element: its kind, specialised by frame or shape where that helps. */
export function ElementIcon({ el }: { el: SlideElement }) {
  switch (el.kind) {
    case 'text':
      return <Type />;
    case 'device':
      if (el.frame === 'ipad' || el.frame === 'android-tablet') return <Tablet />;
      if (el.frame === 'macbook') return <Laptop />;
      if (el.frame === 'browser') return <AppWindowMac />;
      if (el.frame === 'none') return <RectangleVertical />;
      return <Smartphone />;
    case 'shape':
      if (el.shape === 'rect') return <Square />;
      if (el.shape === 'ring') return <RingIcon />;
      if (el.shape === 'blob') return <BlobIcon />;
      return <Circle />;
    case 'image':
      return <ImageIcon />;
  }
}
